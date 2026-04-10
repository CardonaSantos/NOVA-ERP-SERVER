// notification.service.ts
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  NotiAudience,
  NotiCategory,
  NotiSeverity,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LegacyGateway } from 'src/web-sockets/websocket.gateway';
import { UiNotificacionDTO } from './common/UINotificationDto';
import { toUiNotificacion } from './common/notification.formatter';

type CreateNotificacionBase = {
  titulo?: string | null;
  mensaje: string;
  categoria?: NotiCategory;
  subtipo?: string | null;
  severidad?: NotiSeverity;
  route?: string | null;
  actionLabel?: string | null;
  meta?: Prisma.JsonValue | null;
  referenciaTipo?: string | null;
  referenciaId?: number | null;
  remitenteId?: number | null;
  sucursalId?: number | null;
  audiencia?: NotiAudience; // default USUARIOS
};

type CreateForUsersInput = CreateNotificacionBase & {
  userIds: number[];
};

// filtros de GET
type GetOpts = {
  take?: number; // default 30
  cursorId?: number | null; // paginación
  soloNoLeidas?: boolean;
  categoria?: NotiCategory;
  minSeverity?: NotiSeverity; // filtra severidad >=
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: LegacyGateway,
  ) {}

  // ========= CREAR (multi-usuario) =========
  async createForUsers(
    input: CreateForUsersInput,
  ): Promise<UiNotificacionDTO[]> {
    const {
      userIds,
      titulo = null,
      mensaje,
      categoria = NotiCategory.OTROS,
      subtipo = null,
      severidad = NotiSeverity.INFORMACION,
      route = null,
      actionLabel = null,
      meta = null,
      referenciaTipo = null,
      referenciaId = null,
      remitenteId = null,
      sucursalId = null,
      audiencia = NotiAudience.USUARIOS,
    } = input;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestException('Debe proveer al menos un usuario destino');
    }

    const noti = await this.prisma.notificacion.create({
      data: {
        titulo,
        mensaje,
        categoria,
        subtipo,
        severidad,
        route,
        actionLabel,
        meta,
        referenciaTipo,
        referenciaId,
        remitenteId,
        sucursalId,
        audiencia,
      },
    });

    await this.prisma.notificacionesUsuarios.createMany({
      data: userIds.map((usuarioId) => ({
        usuarioId,
        notificacionId: noti.id,
        leido: false,
        eliminado: false,
      })),
      skipDuplicates: true,
    });

    // Traemos filas ya “join” para formatear al DTO UI
    const rows = await this.prisma.notificacionesUsuarios.findMany({
      where: { usuarioId: { in: userIds }, notificacionId: noti.id },
      include: {
        notificacion: {
          include: { remitente: { select: { id: true, nombre: true } } },
        },
      },
    });

    const payloads: UiNotificacionDTO[] = rows.map(toUiNotificacion);

    // WS: emitimos el mismo DTO que devuelve el GET
    this.ws.emitNotiToUsers(payloads[0], userIds); // mismo shape para todos

    return payloads;
  }

  // ========= CREAR (unitaria) =========
  async createOne(
    input: Omit<CreateForUsersInput, 'userIds'> & { userId: number },
  ): Promise<UiNotificacionDTO> {
    const res = await this.createForUsers({
      ...input,
      userIds: [input.userId],
    });
    return res[0];
  }

  // ========= GET (bandeja del usuario) =========
  async getMyNotifications(
    userId: number,
    opts: GetOpts = {},
  ): Promise<UiNotificacionDTO[]> {
    const {
      cursorId = null,
      soloNoLeidas = false,
      categoria,
      minSeverity,
    } = opts;

    const where: Prisma.NotificacionesUsuariosWhereInput = {
      usuarioId: userId,
      eliminado: false,
      ...(soloNoLeidas ? { leido: false } : {}),
      ...(categoria ? { notificacion: { categoria } } : {}),
      ...(minSeverity
        ? {
            notificacion: {
              severidad: {
                // Prisma no tiene ">= enum" directo; si necesitas, resuélvelo en app/mapper
                // aquí lo dejamos fuera o usa un set de severidades válidas
              } as any,
            },
          }
        : {}),
    };

    const rows = await this.prisma.notificacionesUsuarios.findMany({
      where,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { recibidoEn: 'desc' },
      include: {
        notificacion: {
          include: { remitente: { select: { id: true, nombre: true } } },
        },
      },
    });

    return rows.map(toUiNotificacion);
  }

  // ========= MARCAR LEÍDO =========
  async markAsRead(userId: number, notificacionId: number): Promise<void> {
    await this.prisma.notificacionesUsuarios.updateMany({
      where: { usuarioId: userId, notificacionId },
      data: { leido: true, leidoEn: new Date() },
    });
  }

  async markAllAsRead(userId: number): Promise<number> {
    const res = await this.prisma.notificacionesUsuarios.updateMany({
      where: { usuarioId: userId, leido: false, eliminado: false },
      data: { leido: true, leidoEn: new Date() },
    });
    return res.count;
  }

  // ========= DESCARTAR (soft delete) =========
  async dismiss(userId: number, notificacionId: number): Promise<void> {
    await this.prisma.notificacionesUsuarios.updateMany({
      where: { usuarioId: userId, notificacionId },
      data: { eliminado: true, dismissedAt: new Date() },
    });
  }

  // ========= ELIMINAR RELACIÓN (hard) =========
  async deleteForUser(userId: number, notificacionId: number): Promise<void> {
    try {
      const row = await this.prisma.notificacionesUsuarios.findFirst({
        where: { usuarioId: userId, notificacionId },
        select: { id: true },
      });
      if (!row) return; // idempotente
      await this.prisma.notificacionesUsuarios.delete({
        where: { id: row.id },
      });
    } catch (error) {
      this.logger.error(
        'Error generado en modulo de notificaciones-eliminacion: ',
        error,
      );
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal Error: Error inesperado');
    }
  }
  async deleteAllUserNotifications(userId: number): Promise<void> {
    try {
      await this.prisma.notificacionesUsuarios.deleteMany({
        where: { usuarioId: userId },
      });
      // no retornes nada; 204 en controller
    } catch (error) {
      this.logger.error(
        'Error generado en eliminación de notificaciones: ',
        error,
      );
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal Error: Error inesperado en módulo notificaciones',
      );
    }
  }

  // ========= LEGACY WRAPPERS (opcional, para transición) =========
  // Si aún te llaman con "tipo: TipoNotificacion" mapea a (categoria/subtipo/severidad)
  async createLegacy(
    mensaje: string,
    remitenteId: number | null,
    userIds: number[],
    tipo: any, // TipoNotificacion (legacy)
    referenciaId?: number | null,
  ): Promise<UiNotificacionDTO[]> {
    const map = this.mapLegacy(tipo);
    return this.createForUsers({
      mensaje,
      remitenteId,
      userIds,
      categoria: map.categoria,
      subtipo: map.subtipo,
      severidad: map.severidad,
      referenciaId: referenciaId ?? null,
      referenciaTipo: map.referenciaTipo,
      titulo: null,
    });
  }

  private mapLegacy(tipo: any): {
    categoria: NotiCategory;
    subtipo: string;
    severidad: NotiSeverity;
    referenciaTipo: string | null;
  } {
    switch (String(tipo)) {
      case 'SOLICITUD_PRECIO':
        return {
          categoria: NotiCategory.VENTAS,
          subtipo: 'PRICE_REQUEST',
          severidad: NotiSeverity.INFORMACION,
          referenciaTipo: 'SolicitudPrecio',
        };
      case 'TRANSFERENCIA':
        return {
          categoria: NotiCategory.INVENTARIO,
          subtipo: 'TRANSFER_REQUEST',
          severidad: NotiSeverity.ALERTA,
          referenciaTipo: 'Transferencia',
        };
      case 'VENCIMIENTO':
        return {
          categoria: NotiCategory.INVENTARIO,
          subtipo: 'EXPIRY',
          severidad: NotiSeverity.ALERTA,
          referenciaTipo: 'Lote',
        };
      case 'STOCK_BAJO':
        return {
          categoria: NotiCategory.INVENTARIO,
          subtipo: 'LOW_STOCK',
          severidad: NotiSeverity.ALERTA,
          referenciaTipo: 'Producto',
        };
      case 'CREDITO_VENTA':
        return {
          categoria: NotiCategory.CREDITO,
          subtipo: 'SALE_CREDIT',
          severidad: NotiSeverity.INFORMACION,
          referenciaTipo: 'Credito',
        };
      default:
        return {
          categoria: NotiCategory.OTROS,
          subtipo: 'OTHER',
          severidad: NotiSeverity.INFORMACION,
          referenciaTipo: null,
        };
    }
  }
}
