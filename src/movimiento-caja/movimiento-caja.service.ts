import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilidadesService } from 'src/caja/utilidades/utilidades.service';
import { CajaService } from 'src/caja/caja.service';

@Injectable()
export class MovimientoCajaService {
  private readonly logger = new Logger(MovimientoCajaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly utilidades: UtilidadesService,
    private readonly cajaService: CajaService,
  ) {}
  /**
   *
   * @param dto Datos para crear un movimiento de caja manual
   * @returns un movimiento de caja manual
   */
  // async registrarMovimientoCaja(dto: CreateMovimientoCajaDto) {
  //   const {
  //     tipo,
  //     categoria,
  //     monto,
  //     usuarioId,
  //     descripcion,
  //     referencia,
  //     banco,
  //     numeroBoleta,
  //     usadoParaCierre,
  //     proveedorId,
  //     sucursalId,
  //     fecha,
  //   } = dto;

  //   this.logger.log('La data enviada es: ', dto);

  //   if (tipo === 'EGRESO') {
  //     if (!categoria)
  //       throw new BadRequestException('Categoría requerida para EGRESO');

  //     if (categoria === 'COSTO_VENTA' && !proveedorId)
  //       throw new BadRequestException(
  //         'Proveedor obligatorio en Costo de Venta',
  //       );

  //     if (categoria === 'GASTO_OPERATIVO' && !dto.gastoOperativoTipo)
  //       throw new BadRequestException(
  //         'Subtipo de gasto operativo es obligatorio',
  //       );
  //   }

  //   const isDepositoCierre =
  //     tipo === 'DEPOSITO_BANCO' && categoria === 'DEPOSITO_CIERRE';

  //   if (!isDepositoCierre && (monto == null || monto <= 0)) {
  //     throw new BadRequestException('El monto debe ser mayor que 0');
  //   }

  //   if ([tipo, usuarioId].some((p) => p == null)) {
  //     throw new BadRequestException('Falta propiedad obligatoria');
  //   }

  //   if (tipo === 'DEPOSITO_BANCO' && (!banco || !numeroBoleta)) {
  //     throw new BadRequestException(
  //       'Depósito: banco y numeroBoleta son obligatorios',
  //     );
  //   }

  //   const requiereCaja = (() => {
  //     if (tipo === 'DEPOSITO_BANCO' && categoria === 'DEPOSITO_PROVEEDOR')
  //       return false;
  //     return [
  //       // 'INGRESO',
  //       'EGRESO',
  //       'RETIRO',
  //       'CHEQUE',
  //       'DEPOSITO_BANCO',
  //     ].includes(tipo as any);
  //   })();

  //   if (requiereCaja && !sucursalId) {
  //     throw new BadRequestException(
  //       'sucursalId es obligatorio cuando el movimiento requiere caja',
  //     );
  //   }

  //   if (tipo === 'EGRESO') {
  //     if (!categoria)
  //       throw new BadRequestException('Categoría requerida para EGRESO');
  //     if (categoria === 'COSTO_VENTA' && !proveedorId) {
  //       throw new BadRequestException(
  //         'Proveedor obligatorio en Costo de Venta',
  //       );
  //     }
  //   }

  //   if (tipo === 'DEPOSITO_BANCO') {
  //     if (!categoria)
  //       throw new BadRequestException('Categoría requerida para Depósito');
  //     if (categoria === 'DEPOSITO_CIERRE') {
  //       if (!banco || !numeroBoleta)
  //         throw new BadRequestException(
  //           'Banco y boleta obligatorios para depósito de cierre',
  //         );
  //       dto.usadoParaCierre = true;
  //     }
  //     if (categoria === 'DEPOSITO_PROVEEDOR' && !proveedorId) {
  //       throw new BadRequestException(
  //         'Proveedor obligatorio para depósito a proveedor',
  //       );
  //     }
  //   }

  //   const cajaAbiertaReciente = await this.prisma.registroCaja.findFirst({
  //     where: {
  //       usuarioInicioId: usuarioId,
  //       sucursalId: sucursalId,
  //       estado: 'ABIERTO',
  //       usuarioCierreId: null,
  //     },
  //   });
  //   this.logger.log('La caja abiera es: ', cajaAbiertaReciente);

  //   if (requiereCaja && !cajaAbiertaReciente) {
  //     this.logger.warn(
  //       'Intento de registrar movimiento que caja sin caja abierta',
  //     );
  //     throw new BadRequestException(
  //       'No hay caja abierta para registrar este movimiento.',
  //     );
  //   }

  //   const registroCajaId = cajaAbiertaReciente?.id ?? null;

  //   if (registroCajaId) {
  //     const caja = await this.prisma.registroCaja.findUnique({
  //       where: { id: registroCajaId },
  //       select: { estado: true },
  //     });
  //     if (!caja) throw new BadRequestException('registroCajaId inválido');
  //     if (caja.estado !== 'ABIERTO') {
  //       throw new BadRequestException(
  //         'No se pueden registrar movimientos en una caja cerrada',
  //       );
  //     }
  //   }

  //   if (dto.tipo === 'DEPOSITO_BANCO' && dto.categoria === 'DEPOSITO_CIERRE') {
  //     return this.registrarDepositoCierre({
  //       sucursalId: dto.sucursalId!,
  //       usuarioId: dto.usuarioId,
  //       banco: dto.banco!,
  //       numeroBoleta: dto.numeroBoleta!,
  //       monto: dto.depositarTodo ? undefined : dto.monto,
  //       depositarTodo: dto.depositarTodo ?? true, // por defecto, true
  //       descripcion: dto.descripcion,
  //       fecha: dto.fecha,
  //     });
  //   }

  //   // Construir data sin `connect: null`
  //   const data: any = {
  //     tipo,
  //     monto,
  //     descripcion,
  //     referencia,
  //     banco,
  //     numeroBoleta,
  //     usuario: { connect: { id: usuarioId } },
  //   };
  //   if (categoria) data.categoria = categoria;
  //   if (dto.gastoOperativoTipo)
  //     data.gastoOperativoTipo = dto.gastoOperativoTipo; //nuevo 18

  //   if (typeof usadoParaCierre === 'boolean')
  //     data.usadoParaCierre = usadoParaCierre;
  //   if (registroCajaId) data.registroCaja = { connect: { id: registroCajaId } };
  //   if (proveedorId) data.proveedor = { connect: { id: Number(proveedorId) } };
  //   if (fecha) {
  //     data.fecha = dayjs(fecha).toDate(); // respeta la hora local seleccionada
  //   }
  //   try {
  //     const newCaja = await this.prisma.movimientoCaja.create({ data });
  //     this.logger.debug('La nueva caja creada es: ', newCaja);
  //   } catch (error) {
  //     this.logger.error('Error registrando movimiento:', error);
  //     if (error instanceof HttpException) throw error;
  //     throw new InternalServerErrorException(
  //       'Error inesperado al guardar movimiento de caja',
  //     );
  //   }
  // }

  /**
   *
   * @param cajaId ID de la caja la cual queremos obtener los movimientos ligados
   * @returns
   */
  async getMovimientosPorCaja(cajaId: number) {
    // if (!cajaId) throw new BadRequestException('cajaId requerido');
    // const items = await this.prisma.movimientoCaja.findMany({
    //   where: { registroCajaId: cajaId },
    //   orderBy: { fecha: 'desc' },
    //   select: {
    //     id: true,
    //     fecha: true,
    //     tipo: true,
    //     categoria: true,
    //     monto: true,
    //     descripcion: true,
    //     referencia: true,
    //     banco: true,
    //     numeroBoleta: true,
    //     usadoParaCierre: true,
    //     proveedor: { select: { id: true, nombre: true } },
    //     usuario: { select: { id: true, nombre: true } },
    //   },
    // });
    // return items.map((m) => ({
    //   id: m.id,
    //   fecha: m.fecha.toISOString(),
    //   tipo: m.tipo,
    //   categoria: m.categoria,
    //   monto: m.monto,
    //   descripcion: m.descripcion ?? null,
    //   referencia: m.referencia ?? null,
    //   banco: m.banco ?? null,
    //   numeroBoleta: m.numeroBoleta ?? null,
    //   usadoParaCierre: !!m.usadoParaCierre,
    //   proveedor: m.proveedor
    //     ? { id: m.proveedor.id, nombre: m.proveedor.nombre }
    //     : null,
    //   usuario: { id: m.usuario.id, nombre: m.usuario.nombre },
    // }));
  }

  /**
   *
   * @returns Todos los registros de movimentos para desarrollo local
   */
  // async getAllMovimientos(): Promise<MovimientoCajaItem[]> {
  //   const items = await this.prisma.movimientoCaja.findMany({
  //     orderBy: { fecha: 'desc' },
  //     select: {
  //       id: true,
  //       fecha: true,
  //       tipo: true,
  //       categoria: true,
  //       monto: true,
  //       descripcion: true,
  //       referencia: true,
  //       banco: true,
  //       numeroBoleta: true,
  //       usadoParaCierre: true,
  //       proveedor: { select: { id: true, nombre: true } },
  //       usuario: { select: { id: true, nombre: true } },
  //     },
  //   });

  //   return items.map((m) => ({
  //     id: m.id,
  //     fecha: m.fecha.toISOString(),
  //     tipo: m.tipo,
  //     categoria: m.categoria,
  //     monto: m.monto,
  //     descripcion: m.descripcion ?? null,
  //     referencia: m.referencia ?? null,
  //     banco: m.banco ?? null,
  //     numeroBoleta: m.numeroBoleta ?? null,
  //     usadoParaCierre: !!m.usadoParaCierre,
  //     proveedor: m.proveedor
  //       ? { id: m.proveedor.id, nombre: m.proveedor.nombre }
  //       : null,
  //     usuario: { id: m.usuario.id, nombre: m.usuario.nombre },
  //   }));
  // }

  // async registrarDepositoDeCierre(
  //   dto: CreateMovimientoCajaDto & { depositarTodo?: boolean },
  // ) {
  //   const { usuarioId, sucursalId, banco, numeroBoleta, depositarTodo } = dto;

  //   return this.prisma.$transaction(async (tx) => {
  //     const caja = await tx.registroCaja.findFirst({
  //       where: {
  //         sucursalId,
  //         usuarioInicioId: usuarioId,
  //         estado: 'ABIERTO',
  //         fechaCierre: null,
  //       },
  //       orderBy: { fechaApertura: 'desc' },
  //       select: { id: true, saldoInicial: true, sucursalId: true },
  //     });
  //     if (!caja)
  //       throw new BadRequestException(
  //         'No hay caja abierta para depósito de cierre',
  //       );

  //     await tx.$queryRawUnsafe(
  //       `SELECT id FROM "RegistroCaja" WHERE id = ${caja.id} FOR UPDATE`,
  //     );

  //     // 2) Si depositarTodo, calcular neto antes de crear el movimiento
  //     let monto = dto.monto;
  //     if (depositarTodo) {
  //       const totPrevio = await this.utilidades.calcularTotalesTurno(
  //         tx,
  //         caja.id,
  //       );
  //       const saldoCalculado = caja.saldoInicial + totPrevio.neto;
  //       monto = saldoCalculado; // todo lo que hay en efectivo
  //       if (monto <= 0)
  //         throw new BadRequestException('No hay efectivo para depositar');
  //     }
  //     if (!monto || monto <= 0)
  //       throw new BadRequestException('Monto de depósito inválido');

  //     const mov = await tx.movimientoCaja.create({
  //       data: {
  //         tipo: 'DEPOSITO_BANCO',
  //         categoria: 'DEPOSITO_CIERRE',
  //         usadoParaCierre: true,
  //         monto,
  //         banco: banco!,
  //         numeroBoleta: numeroBoleta!,
  //         usuario: { connect: { id: usuarioId } },
  //         registroCaja: { connect: { id: caja.id } },
  //       },
  //     });

  //     const tot = await this.utilidades.calcularTotalesTurno(tx, caja.id);
  //     const saldoFinal = caja.saldoInicial + tot.neto;

  //     const cerrada = await tx.registroCaja.update({
  //       where: { id: caja.id },
  //       data: {
  //         estado: 'CERRADO',
  //         fechaCierre: new Date(),
  //         usuarioCierre: { connect: { id: usuarioId } },
  //         saldoFinal,
  //         comentarioFinal: dto.descripcion ?? null,
  //         depositado: true, // hubo depósito de cierre
  //       },
  //     });

  //     await this.utilidades.upsertSaldoDiarioTx(
  //       tx,
  //       caja.sucursalId,
  //       cerrada,
  //       tot,
  //     );

  //     return { movimiento: mov, caja: cerrada };
  //   });
  // }

  // async deleteMovimientoById(movimientoID: number) {
  //   try {
  //     if (!movimientoID) {
  //       throw new BadRequestException('Error al eliminar movimiento');
  //     }

  //     const movimientoToDelete = await this.prisma.movimientoCaja.delete({
  //       where: {
  //         id: movimientoID,
  //       },
  //     });

  //     if (!movimientoToDelete) {
  //       throw new NotFoundException(
  //         'Error al encontrar registro para eliminarg',
  //       );
  //     }
  //     return movimientoToDelete;
  //   } catch (error) {
  //     this.logger.error('Error es: ', error);
  //     if (error instanceof HttpException) throw error;
  //     throw new BadRequestException('Error inesperado');
  //   }
  // }

  /**
   *
   * @param dto Dto especial para cerrar una caja mediante deposito/movimiento
   * @returns
   */
  // async registrarDepositoCierre(dto: DepositoCierreDto) {
  //   const { sucursalId, usuarioId, banco, numeroBoleta, descripcion } = dto;

  //   return this.prisma.$transaction(async (tx) => {
  //     // caja abierta + lock
  //     const caja = await tx.registroCaja.findFirst({
  //       where: {
  //         sucursalId,
  //         usuarioInicioId: usuarioId,
  //         estado: 'ABIERTO',
  //         fechaCierre: null,
  //       },
  //       orderBy: { fechaApertura: 'desc' },
  //       select: { id: true, saldoInicial: true, sucursalId: true },
  //     });
  //     if (!caja)
  //       throw new BadRequestException(
  //         'No hay caja abierta para depósito de cierre',
  //       );
  //     await tx.$queryRawUnsafe(
  //       `SELECT id FROM "RegistroCaja" WHERE id = ${caja.id} FOR UPDATE`,
  //     );

  //     // efectivo disponible
  //     const tot = await this.utilidades.calcularTotalesTurno(tx, caja.id);
  //     const efectivoDisponible = caja.saldoInicial + tot.ingresos - tot.egresos;
  //     if (efectivoDisponible <= 0) {
  //       throw new BadRequestException('No hay efectivo disponible');
  //     }

  //     const depositarTodo = dto.depositarTodo ?? dto.monto == null; // si no mandan monto, asumo todo
  //     const monto = depositarTodo ? efectivoDisponible : (dto.monto ?? 0);

  //     if (!depositarTodo) {
  //       if (monto <= 0)
  //         throw new BadRequestException('Monto inválido para depósito parcial');
  //       if (monto > efectivoDisponible)
  //         throw new BadRequestException(
  //           'El efectivo disponible cambió. Actualiza y vuelve a intentar.',
  //         );
  //     }

  //     const mov = await tx.movimientoCaja.create({
  //       data: {
  //         tipo: 'DEPOSITO_BANCO',
  //         categoria: 'DEPOSITO_CIERRE',
  //         usadoParaCierre: true,
  //         monto,
  //         banco,
  //         numeroBoleta,
  //         descripcion,
  //         usuario: { connect: { id: usuarioId } },
  //         registroCaja: { connect: { id: caja.id } },
  //       },
  //     });

  //     // cerrar (depositado = true si depositarTodo, o si el saldo quedó 0)
  //     const cerrada = await this.cerrarCajaTx(tx, {
  //       cajaID: caja.id,
  //       usuarioCierra: usuarioId,
  //       comentarioFinal: descripcion,
  //       estado: dto.depositarTodo ? 'CERRADO' : 'ARQUEO',
  //       depositado: depositarTodo || monto === efectivoDisponible, // true si quedó en 0
  //     });

  //     return { movimiento: mov, caja: cerrada };
  //   });
  // }

  //=========================> HELPERS EXTRA

  async getAllMovimientos() {
    // return this.prisma.
  }
}
