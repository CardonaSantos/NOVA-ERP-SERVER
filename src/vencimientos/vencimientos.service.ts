import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotiCategory, NotiSeverity, NotiAudience } from '@prisma/client';
import { UpdateVencimientoDto } from './dto/update-vencimiento.dto';
import { dayjs } from 'src/utils/dayjs';
type StageKey = 'T-45' | 'T-30' | 'T-15' | 'T-7' | 'EXPIRED';
const TZ = 'America/Guatemala';

function formatFechaGT(fecha: Date) {
  return dayjs(fecha).tz(TZ, true).format('D [de] MMMM [de] YYYY');
}

function pickStage(daysRemaining: number): StageKey | null {
  if (daysRemaining <= 0) return 'EXPIRED';
  if (daysRemaining <= 7) return 'T-7';
  if (daysRemaining <= 15) return 'T-15';
  if (daysRemaining <= 30) return 'T-30';
  if (daysRemaining <= 45) return 'T-45';
  return null;
}

function pickSeverity(stage: StageKey): NotiSeverity {
  switch (stage) {
    case 'EXPIRED':
      return NotiSeverity.CRITICO;
    case 'T-7':
    case 'T-15':
      return NotiSeverity.ALERTA;
    default:
      return NotiSeverity.INFORMACION; // T-30, T-45
  }
}

@Injectable()
export class VencimientosService {
  private readonly logger = new Logger(VencimientosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}
  // @Cron(CronExpression.EVERY_MINUTE, {
  //   name: 'vencimientos.dailyCheck',
  //   timeZone: TZ,
  // })

  // Corre cada día a las 06:00 a.m. (hora GT)
  @Cron('0 6 * * *', {
    name: 'vencimientos.dailyCheck',
    timeZone: TZ,
  })
  async runDaily() {
    try {
      await this.scanAndNotify();
    } catch (err) {
      this.logger.error('Fallo en cron de vencimientos', err);
    }
  }

  /** Escanea stocks (producto y presentaciones) con fecha de vencimiento y notifica por etapas. */
  async scanAndNotify() {
    const hoy = dayjs().tz(TZ).startOf('day');

    // Ventana: desde ya (incluye vencidos) hasta +45 días
    const maxDate = hoy.add(45, 'day').endOf('day');

    this.logger.log(
      `🔍 Escaneando vencimientos entre ${hoy.format('DD/MM/YYYY')} y ${maxDate.format('DD/MM/YYYY')}`,
    );

    // === Lotes por producto base (Stock) ===
    const lotes = await this.prisma.stock.findMany({
      where: {
        cantidad: { gt: 0 },
        fechaVencimiento: { not: null, lte: maxDate.toDate() },
      },
      include: {
        producto: { select: { id: true, nombre: true, codigoProducto: true } },
        sucursal: { select: { id: true, nombre: true } },
      },
    });

    // === Lotes por presentación (StockPresentacion) ===
    const lotesPres = await this.prisma.stockPresentacion.findMany({
      where: {
        cantidadPresentacion: { gt: 0 },
        fechaVencimiento: { not: null, lte: maxDate.toDate() },
      },
      include: {
        producto: { select: { id: true, nombre: true, codigoProducto: true } },
        presentacion: { select: { id: true, nombre: true } },
        sucursal: { select: { id: true, nombre: true } },
      },
    });

    this.logger.log(
      `Encontrados ${lotes.length} lotes de producto y ${lotesPres.length} lotes de presentación para evaluar.`,
    );

    for (const s of lotes) {
      await this.processStockLote({
        referenciaTipo: 'Lote', // estandar
        referenciaId: s.id,
        productoId: s.productoId,
        productoNombre: s.producto?.nombre ?? '#Producto',
        sucursalId: s.sucursalId,
        sucursalNombre: s.sucursal?.nombre ?? null,
        fechaVencimiento: s.fechaVencimiento!,
        cantidad: s.cantidad,
        route: `/inventario/producto/${s.productoId}?highlightStock=${s.id}`,
      });
    }

    for (const sp of lotesPres) {
      await this.processStockLote({
        referenciaTipo: 'LotePresentacion',
        referenciaId: sp.id,
        productoId: sp.productoId,
        productoNombre: `${sp.producto?.nombre ?? '#Producto'} — ${sp.presentacion?.nombre ?? 'presentación'}`,
        sucursalId: sp.sucursalId,
        sucursalNombre: sp.sucursal?.nombre ?? null,
        fechaVencimiento: sp.fechaVencimiento!,
        cantidad: sp.cantidadPresentacion,
        route: `/inventario/producto/${sp.productoId}?presentacionId=${sp.presentacionId}&highlightStockPres=${sp.id}`,
      });
    }
  }

  private async processStockLote(p: {
    referenciaTipo: 'Lote' | 'LotePresentacion';
    referenciaId: number;
    productoId: number;
    productoNombre: string;
    sucursalId: number;
    sucursalNombre: string | null;
    fechaVencimiento: Date;
    cantidad: number | null;
    route: string;
  }) {
    const hoy = dayjs().tz(TZ).startOf('day');
    const exp = dayjs(p.fechaVencimiento).tz(TZ, true).startOf('day');

    const daysRemaining = exp.diff(hoy, 'day');
    const stage = pickStage(daysRemaining);

    if (!stage) {
      // Aún falta más de 45 días — nada que hacer
      return;
    }

    // Idempotencia por etapa (no duplicar por cada ejecución)
    const exists = await this.prisma.notificacion.findFirst({
      where: {
        referenciaTipo: p.referenciaTipo,
        referenciaId: p.referenciaId,
        subtipo: `EXPIRY_${stage}`,
        categoria: NotiCategory.INVENTARIO,
      },
      select: { id: true },
    });

    if (exists) {
      return;
    }

    // Asegura un registro de Vencimiento (uno por lote, al primer aviso)
    await this.ensureVencimientoRecord(
      p.referenciaTipo,
      p.referenciaId,
      p.fechaVencimiento,
      p.productoNombre,
      daysRemaining,
    );

    // Destinatarios: TODOS los usuarios activos de la sucursal (admins y vendedores)
    const users = await this.prisma.usuario.findMany({
      where: { activo: true, sucursalId: p.sucursalId },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return;

    const fechaFmt = formatFechaGT(p.fechaVencimiento);

    // Título y mensaje
    const titulo =
      stage === 'EXPIRED'
        ? 'Producto vencido'
        : `Producto por vencer (${stage.replace('T-', '≤ ')} días)`;

    const diasTxt =
      stage === 'EXPIRED'
        ? 'ya vencido'
        : `faltan ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}`;

    const mensaje =
      stage === 'EXPIRED'
        ? `El lote de "${p.productoNombre}" está VENCIDO (desde ${fechaFmt}).`
        : `El lote de "${p.productoNombre}" vence el ${fechaFmt} — ${diasTxt}. Cantidad: ${p.cantidad ?? 0}.`;

    const severity = pickSeverity(stage);

    await this.notifications.createForUsers({
      userIds,
      titulo,
      mensaje,
      categoria: NotiCategory.INVENTARIO,
      subtipo: `EXPIRY_${stage}`, // EXPIRY_T-45 / T-30 / T-15 / T-7 / EXPIRED
      severidad: severity,
      route: p.route,
      actionLabel: 'Revisar lote',
      referenciaTipo: p.referenciaTipo, // 'Lote' | 'LotePresentacion'
      referenciaId: p.referenciaId,
      sucursalId: p.sucursalId,
      meta: {
        productoId: p.productoId,
        productoNombre: p.productoNombre,
        sucursal: { id: p.sucursalId, nombre: p.sucursalNombre },
        fechaVencimiento: p.fechaVencimiento.toISOString(),
        cantidad: p.cantidad ?? null,
        daysRemaining,
        stage,
      },
      audiencia: NotiAudience.SUCURSAL, // intención; igual persistimos por usuario
    });
  }

  private async ensureVencimientoRecord(
    referenciaTipo: 'Lote' | 'LotePresentacion',
    referenciaId: number,
    fechaVencimiento: Date,
    productoNombre: string,
    daysRemaining: number,
  ) {
    // El modelo Vencimiento está atado a Stock (lote de producto base).
    // Para presentaciones, puedes crear otra tabla o registrar de igual forma si mapeas al lote base.
    if (referenciaTipo !== 'Lote') return;

    const ya = await this.prisma.vencimiento.findFirst({
      where: { stockId: referenciaId },
      select: { id: true },
    });
    if (ya) return;

    const descripcion =
      daysRemaining <= 0
        ? `El producto ${productoNombre} está vencido.`
        : `El producto ${productoNombre} se vencerá en ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}.`;

    await this.prisma.vencimiento.create({
      data: {
        stockId: referenciaId,
        fechaVencimiento,
        descripcion,
        estado: 'PENDIENTE',
      },
    });
  }

  //SERIVICIOS CRUD

  async findAll() {
    try {
      const registrosVencimiento = await this.prisma.vencimiento.findMany({
        orderBy: {
          fechaCreacion: 'desc',
        },
        where: {
          stock: {
            isNot: null,
          },
        },
        include: {
          stock: {
            select: {
              sucursal: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  codigoProducto: true,
                },
              },
            },
          },
        },
      });
      return registrosVencimiento;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al conseguir registros');
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} vencimiento`;
  }

  async update(id: number, updateVencimientoDto: UpdateVencimientoDto) {
    try {
      const vencimientoActualizado = await this.prisma.vencimiento.update({
        where: {
          id: id,
        },
        data: {
          estado: 'RESUELTO',
        },
      });
      return vencimientoActualizado;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al actualizar registro');
    }
  }

  async removeAll() {
    try {
      const regists = await this.prisma.vencimiento.deleteMany({});
      return regists;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al eliminar registros');
    }
  }
}
