import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { NotificationToEmit } from './Types/NotificationTypeSocket';
import { nuevaSolicitud } from './Types/SolicitudType';
import { solicitudTransferencia } from './Types/TransferenciaType';
import EventEmitter from 'events';
//DAYJS
import { NormalizedSolicitud } from 'src/credito-autorization/common/normalizerAutorizacionesResponse';
import { UiNotificacionDTO } from 'src/notification/common/UINotificationDto';

type CreditAuthorizationCreatedEvent = NormalizedSolicitud;

@Injectable()
@WebSocketGateway({ namespace: '/legacy', cors: { origin: '*' } })
export class LegacyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LegacyGateway.name);
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<number, Set<string>>(); //para metricas
  //persistencia de usuarios
  private vendedores = new Map<number, string>();
  private admins = new Map<number, string>();
  private usuarios = new Map<number, string>();

  private num(v: unknown): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  handleConnection(client: Socket) {
    client.setMaxListeners(40);

    const q = client.handshake.query as Record<string, any>;
    const userId = this.num(q.userID ?? q.userId);
    const rol =
      (q.rol ?? q.role ?? '').toString().trim().toUpperCase() || undefined;
    const sucursalId = this.num(q.sucursalId);
    //si el query está mal, entonces sal
    if (!userId) {
      this.logger.warn(
        `WS conexión rechazada: userId inválido (${q.userID ?? q.userId})`,
      );
      client.emit('error', { code: 'INVALID_USER_ID' });
      return client.disconnect(true);
    }
    //Si los datos son validos, contruimos el socket, guarda identidad
    client.data.userId = userId;
    client.data.rol = rol;
    client.data.sucursalId = sucursalId;

    // a un room publico, unete donde el:`user:${userId}`
    client.join('public');
    client.join(`user:${userId}`);
    if (rol) client.join(`rol:${rol}`);
    if (sucursalId) client.join(`sucursal:${sucursalId}`);

    //
    //track multi-pestaña: si no estaba, creale un set
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId)!.add(client.id); //toma este set del nuevo, y añadele su client id (socket ID)

    this.usuarios.set(userId, client.id);
    if (rol === 'ADMIN') this.admins.set(userId, client.id);
    else if (rol === 'VENDEDOR') this.vendedores.set(userId, client.id);

    this.logger.log(
      `WS conectado sid=${client.id} uid=${userId} rol=${rol ?? '-'} suc=${sucursalId ?? '-'}`,
    );
    this.logEstado();
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as number | undefined;
    const rol = client.data?.rol as string | undefined;

    if (userId) {
      // Limpia multi-pestaña
      const set = this.userSockets.get(userId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) this.userSockets.delete(userId);
      }

      // (Compat) limpia mapas “legacy” solo si el que sale es el que estaba guardado
      if (this.usuarios.get(userId) === client.id) this.usuarios.delete(userId);
      if (rol === 'ADMIN' && this.admins.get(userId) === client.id)
        this.admins.delete(userId);
      if (rol === 'VENDEDOR' && this.vendedores.get(userId) === client.id)
        this.vendedores.delete(userId);

      this.logger.log(`WS desconectado sid=${client.id} uid=${userId}`);
      this.logEstado();
    }
  }

  @SubscribeMessage('enviarNotificacion')
  handleEnviarNotificacion(
    notificacion: NotificationToEmit,
    usuarioId: number,
  ) {
    const socketID = this.usuarios.get(usuarioId);

    console.log('Notificación recibida:', notificacion);

    if (socketID) {
      this.server.to(socketID).emit('recibirNotificacion', notificacion);
      console.log(
        `Notificación enviada a usuario: ${usuarioId} en SocketID: ${socketID}`,
      );
    } else {
      console.log(`No se encontró el SocketID para el usuario ${usuarioId}`);
    }
  }

  //=================> HELPERS DE ENVIÓ

  emitToUser<E extends string>(userId: number, event: E, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToRole<E extends string>(rol: string, event: E, payload: any) {
    this.server.to(`rol:${rol}`).emit(event, payload);
  }

  emitToSucursal<E extends string>(sucursalId: number, event: E, payload: any) {
    this.server.to(`sucursal:${sucursalId}`).emit(event, payload);
  }

  emitToAll<E extends string>(event: E, payload: any) {
    this.server.emit(event, payload);
  }

  emitToUsers<E extends string>(event: E, payload: any, userIds: number[]) {
    for (const uid of userIds) {
      this.server.to(`user:${uid}`).emit(event, payload);
    }
  }

  //=================>
  // LegacyGateway (o tu nuevo Gateway principal)
  emitNotiToUsers(payload: UiNotificacionDTO, userIds: number[]) {
    for (const uid of userIds) {
      this.server.to(`user:${uid}`).emit('noti:new', payload);
    }
  }

  emitSolicitudPrecioToAdmins(p: {
    solicitudId: number;
    comentario?: string;
    vendedorId: number;
  }) {
    this.server.to(`rol:ADMIN`).emit('solicitud:precio', p);
  }

  emitTransferenciaToAdmins(p: {
    id: number;
    monto: number;
    deSucursal: number;
    aSucursal: number;
  }) {
    this.server.to(`rol:ADMIN`).emit('transferencia:solicitud', p);
  }

  //nuevo->

  //ENVIAR LAS SOLICITUDES A LOS ADMINS:::::::::::
  handleEnviarSolicitudPrecio(solicitud: nuevaSolicitud, userID: number) {
    const SOCKEID_ADMIN = this.admins.get(userID);
    this.logger.log('enviado al UI: ', solicitud, userID);
    if (SOCKEID_ADMIN) {
      this.server.to(SOCKEID_ADMIN).emit('recibirSolicitud', solicitud);
    } else {
      console.log(
        `No se encontró el SocketID para el usuario administrador ${userID}`,
      );
    }
  }

  //ENVIAR SOLICITUD DE TRANSFERENCIA
  handleEnviarSolicitudTransferencia(
    solicitudTransferencia: solicitudTransferencia,
    userID: number,
  ) {
    const SOCKEID_ADMIN = this.admins.get(userID);
    if (SOCKEID_ADMIN) {
      this.server
        .to(SOCKEID_ADMIN)
        .emit('recibirSolicitudTransferencia', solicitudTransferencia);
    } else {
      console.log(
        `No se encontró el SocketID para el usuario administrador ${userID}`,
      );
    }
  }

  //NUEVO PARA FORMATO ROOMS
  emitCreditAuthorizationCreated(item: CreditAuthorizationCreatedEvent) {
    this.logger.log('Enviando por socket...');
    this.server.to(`rol:ADMIN`).emit('credit:authorization.created', item);
  }

  //DESARROLLO
  private dumpUserSockets() {
    const obj: Record<string, string[]> = {};
    for (const [uid, set] of this.userSockets.entries()) {
      obj[uid] = Array.from(set.values()); // socketIds activos por usuario
    }
    this.logger.log(`userSockets = ${JSON.stringify(obj, null, 2)}`);
  }

  // Para ver las rooms de un socket
  private logRooms(client: Socket) {
    this.logger.log(
      `rooms de ${client.id}: ${JSON.stringify(Array.from(client.rooms), null, 2)}`,
    );
  }

  private logEstado() {
    const totalSockets =
      [...this.userSockets.values()].reduce((acc, set) => acc + set.size, 0) ||
      0;
    this.logger.log(
      `Usuarios únicos: ${this.userSockets.size} | Sockets activos: ${totalSockets}`,
    );
  }
}
