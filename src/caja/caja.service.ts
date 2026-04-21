import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ClasificacionAdmin,
  ComprobanteTipo,
  EstadoTurnoCaja,
  MetodoPago,
  MotivoMovimiento,
  Prisma,
} from '@prisma/client';
import { dayjs } from 'src/utils/dayjs';

import { VentaLigadaACajaDTO } from './dto/new-dto';
import { IniciarCajaDto } from './dto/iniciar-caja.dto';
import { GetCajasQueryDto } from './GetCajasQueryDto ';
import { UtilitiesService } from 'src/utilities/utilities.service';
import { TZGT } from 'src/utils/utils';
import { CerrarCajaV3Dto } from './dto/CerrarCajaV3Dto';
import {
  metodoPagoFromComprobante,
  toComprobanteNumero,
} from './utils/helpers';

type Paginated<T> = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: T[];
};

@Injectable()
export class CajaService {
  private logger = new Logger(CajaService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly utilities: UtilitiesService,
  ) {}
  private toNum(n: any): number {
    return n == null ? 0 : Number(n);
  }
  private isZero(n: any): boolean {
    return Math.abs(this.toNum(n)) < 0.000001;
  }

  // ---------- INFERENCIAS DESDE DELTAS ----------
  private inferTipo(m: any): string {
    const dc = this.toNum(m.deltaCaja);
    const db = this.toNum(m.deltaBanco);

    if (!this.isZero(dc) && this.isZero(db)) {
      if (dc > 0) return m.motivo === 'VENTA' ? 'VENTA' : 'INGRESO';
      if (dc < 0) return m.motivo === 'DEVOLUCION' ? 'DEVOLUCION' : 'EGRESO';
    }
    if (this.isZero(dc) && !this.isZero(db)) {
      return db > 0 ? 'DEPOSITO_BANCO' : 'RETIRO';
    }
    if (dc < 0 && db > 0) return 'TRANSFERENCIA';
    return 'OTRO';
  }

  private inferCategoria(m: any): string | null {
    if (m.esDepositoCierre || m.motivo === 'DEPOSITO_CIERRE')
      return 'DEPOSITO_CIERRE';
    if (m.esDepositoProveedor || m.motivo === 'DEPOSITO_PROVEEDOR')
      return 'DEPOSITO_PROVEEDOR';
    if (m.clasificacion === 'GASTO_OPERATIVO') return 'GASTO_OPERATIVO';
    if (m.clasificacion === 'COSTO_VENTA') return 'COSTO_VENTA';
    return null;
  }

  private montoDesdeDeltas(m: any): number {
    const dc = this.toNum(m.deltaCaja);
    const db = this.toNum(m.deltaBanco);
    if (!this.isZero(dc)) return Math.abs(dc);
    return Math.abs(db);
  }

  private maybeBoleta(ref: string | null | undefined): string | null {
    if (!ref) return null;
    return /^[0-9]{4,}$/.test(ref) ? ref : null;
  }

  private buildMovWhere(
    dto: GetCajasQueryDto,
  ): Prisma.MovimientoFinancieroWhereInput {
    const ors: Prisma.MovimientoFinancieroWhereInput[] = [];

    // tipo[]
    if (dto.tipo?.length) {
      for (const t of dto.tipo) {
        switch (t) {
          case 'VENTA':
            ors.push({ motivo: MotivoMovimiento.VENTA });
            break;
          case 'INGRESO':
            ors.push({ deltaCaja: { gt: 0 } });
            break;
          case 'EGRESO':
            ors.push({ deltaCaja: { lt: 0 } });
            break;
          case 'DEPOSITO_BANCO':
            ors.push({
              OR: [{ deltaBanco: { gt: 0 } }, { esDepositoCierre: true }],
            });
            break;
          case 'RETIRO':
            ors.push({ deltaBanco: { lt: 0 } });
            break;
          case 'TRANSFERENCIA':
            ors.push({
              AND: [{ deltaCaja: { lt: 0 } }, { deltaBanco: { gt: 0 } }],
            });
            break;
          case 'DEVOLUCION':
            ors.push({ motivo: MotivoMovimiento.DEVOLUCION });
            break;
          default:
            // otros tipos legacy -> no filtrar
            break;
        }
      }
    }

    // categoria[]
    if (dto.categoria?.length) {
      const orCat: Prisma.MovimientoFinancieroWhereInput[] = [];
      for (const c of dto.categoria) {
        switch (c) {
          case 'DEPOSITO_CIERRE':
            orCat.push({ esDepositoCierre: true });
            break;
          case 'DEPOSITO_PROVEEDOR':
            orCat.push({ esDepositoProveedor: true });
            break;
          case 'GASTO_OPERATIVO':
            orCat.push({ clasificacion: ClasificacionAdmin.GASTO_OPERATIVO });
            break;
          case 'COSTO_VENTA':
            orCat.push({ clasificacion: ClasificacionAdmin.COSTO_VENTA });
            break;
          default:
            break;
        }
      }
      if (orCat.length) ors.push({ OR: orCat });
    }

    const where: Prisma.MovimientoFinancieroWhereInput = {};
    if (ors.length) where.AND = [{ OR: ors }];

    // fechas de movimiento
    if (dto.fechaMovInicio || dto.fechaMovFin) {
      if (!Array.isArray(where.AND)) where.AND = [];
      where.AND.push({
        fecha: {
          gte: dto.fechaMovInicio ? new Date(dto.fechaMovInicio) : undefined,
          lte: dto.fechaMovFin ? new Date(dto.fechaMovFin) : undefined,
        },
      });
    }

    // search
    if (dto.search?.trim()) {
      const q = dto.search.trim();
      if (!Array.isArray(where.AND)) where.AND = [];
      where.AND.push({
        OR: [
          { descripcion: { contains: q, mode: 'insensitive' } },
          { referencia: { contains: q, mode: 'insensitive' } },
          { cuentaBancaria: { banco: { contains: q, mode: 'insensitive' } } },
          { proveedor: { nombre: { contains: q, mode: 'insensitive' } } },
          { usuario: { nombre: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    return where;
  }

  async iniciarCaja(dto: IniciarCajaDto) {
    try {
      const { sucursalId, usuarioInicioId, comentario } = dto;
      if ([sucursalId, usuarioInicioId].some((p) => p == null)) {
        throw new BadRequestException(
          'sucursalId y usuarioInicioId son obligatorios',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        // (Opcional pero recomendado en PG) minimizar race conditions al abrir:
        // await tx.$queryRaw`SELECT pg_advisory_xact_lock(${sucursalId}, ${usuarioInicioId})`;

        // 1) No permitir dos turnos abiertos para ESTE usuario en ESTA sucursal
        const abiertaUsuario = await tx.registroCaja.findFirst({
          where: {
            sucursalId,
            usuarioInicioId,
            estado: EstadoTurnoCaja.ABIERTO,
            fechaCierre: null,
          },
          select: { id: true, fechaApertura: true },
        });

        if (abiertaUsuario) {
          throw new BadRequestException(
            `Ya tienes una caja abierta (turno #${abiertaUsuario.id}) en esta sucursal.`,
          );
        }

        // 3) Calcular saldo inicial si no viene
        const saldoInicial =
          dto.saldoInicial != null
            ? dto.saldoInicial
            : await this.getSaldoInicial(tx, sucursalId);

        // 4) Crear el turno
        const newTurno = await tx.registroCaja.create({
          data: {
            sucursal: { connect: { id: sucursalId } },
            usuarioInicio: { connect: { id: usuarioInicioId } },
            comentario: comentario ?? null,
            saldoInicial,
            estado: EstadoTurnoCaja.ABIERTO,
            fondoFijo: dto.fondoFijo ?? 0,
          },
          select: {
            id: true,
            sucursalId: true,
            usuarioInicioId: true,
            saldoInicial: true,
            fechaApertura: true,
            estado: true,
          },
        });

        // Log útil
        this.logger?.log(
          `[Caja] Apertura OK -> turno=${newTurno.id} sucursal=${newTurno.sucursalId} usuario=${newTurno.usuarioInicioId} saldoInicial=${newTurno.saldoInicial}`,
        );

        return newTurno;
      });
    } catch (error) {
      this.logger.error('Error al iniciar caja', error as any);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal Error: Error inesperado en iniciar caja',
      );
    }
  }

  /**
   * NUEVO SERVICIO CORE PARA CERRAR
   * @param registroCajaId
   * @returns
   */
  async cerrarCajaV3(
    dto: CerrarCajaV3Dto & { dejarEnCaja?: number; asentarVentas?: boolean },
  ) {
    this.logger = this.logger ?? new Logger('CajaService');
    this.logger.log('El dto es: ', dto);

    const CASH_LIKE = ['EFECTIVO', 'CONTADO', 'CHEQUE'] as const;
    const n = (v: any) => Number(v ?? 0);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const ahora = dayjs().tz(TZGT).toDate();

    return this.prisma.$transaction(async (tx) => {
      // 1) Turno vigente
      const turno = await tx.registroCaja.findUnique({
        where: { id: dto.registroCajaId },
        select: {
          id: true,
          estado: true,
          saldoInicial: true,
          fondoFijo: true,
          sucursalId: true,
          fechaApertura: true,
        },
      });
      if (!turno || turno.estado !== 'ABIERTO') {
        throw new BadRequestException('Turno no encontrado o ya cerrado');
      }

      // 2) ASIENTO de ventas EFECTIVO por DIFERENCIA (idempotente)
      let ventasEfectivoTurno = 0;
      if (dto.asentarVentas !== false) {
        // ✅ solo ventas EFECTIVO ligadas a ESTA caja/turno
        // const pagosAgg = await tx.pago.aggregate({
        //   _sum: { monto: true },
        //   where: {
        //     venta: {
        //       is: {
        //         registroCajaId: turno.id, // 👈 clave
        //         fechaVenta: { gte: turno.fechaApertura, lte: ahora },
        //       },
        //     },
        //     metodoPago: { in: CASH_LIKE as any },
        //   },
        // });

        const pagosAgg = await tx.pago.aggregate({
          _sum: { monto: true },
          where: {
            venta: {
              is: {
                registroCajaId: turno.id,
                fechaVenta: { gte: turno.fechaApertura, lte: ahora },
                ventaCuota: null,
              },
            },
            // Si quieres considerar solo efectivo:
            // metodoPago: 'EFECTIVO',
            // Si quieres tratar CHEQUE como efectivo (si así operan físicamente), usa:
            metodoPago: { in: ['EFECTIVO', 'CONTADO'] },
          },
        });

        ventasEfectivoTurno = n(pagosAgg._sum.monto);

        // 2.2 cuánto ya está en MF como venta POS (excluye asientos)
        const yaRegAgg = await tx.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            registroCajaId: turno.id,
            // si "clasificacion" es enum, puedes filtrar también por ella; no es imprescindible
            motivo: MotivoMovimiento.VENTA,
            esAsientoVentas: { not: true }, // <-- POS (no asiento)
            deltaCaja: { gt: 0 },
          } as Prisma.MovimientoFinancieroWhereInput,
        });
        const yaRegistradoPOS = n(yaRegAgg._sum.deltaCaja);

        // 2.3 diferencia a cubrir por asiento
        const faltante = Math.max(0, r2(ventasEfectivoTurno - yaRegistradoPOS));

        this.logger.log(
          `[CierreCaja] turno=${turno.id} ` +
            `ventasEfectivoTurno=${ventasEfectivoTurno} ` +
            `yaRegistradoPOS=${yaRegistradoPOS} ` +
            `faltante=${Math.max(0, r2(ventasEfectivoTurno - yaRegistradoPOS))}`,
        );

        const refAsiento = `SYS:ASIENTO_VENTAS_TURNO_${turno.id}`;
        const asientoPrev = await tx.movimientoFinanciero.findUnique({
          where: {
            registroCajaId_referencia: {
              registroCajaId: turno.id,
              referencia: refAsiento,
            },
          },
          select: { id: true },
        });

        if (faltante > 0.01) {
          await tx.movimientoFinanciero.upsert({
            where: {
              registroCajaId_referencia: {
                registroCajaId: turno.id,
                referencia: refAsiento,
              },
            },
            create: {
              sucursalId: turno.sucursalId,
              registroCajaId: turno.id,
              fecha: ahora,
              clasificacion: 'INGRESO', // ajusta a tu enum si aplica
              motivo: MotivoMovimiento.VENTA,
              deltaCaja: r2(faltante),
              deltaBanco: 0,
              referencia: refAsiento,
              esAsientoVentas: true,
              descripcion: 'Asiento de ventas efectivo (ajuste por diferencia)',
              usuarioId: dto.usuarioCierreId,
            },
            update: { fecha: ahora, deltaCaja: r2(faltante) },
          });
        } else if (asientoPrev) {
          // si no falta nada, elimina asiento previo para no contaminar reportes
          await tx.movimientoFinanciero.delete({
            where: { id: asientoPrev.id },
          });
        }
      }

      // 3) Efectivo en caja tras asiento (sumar TODO, sin filtros especiales)
      const aggCaja = await tx.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { registroCajaId: turno.id },
      });
      const enCaja = r2(n(turno.saldoInicial) + n(aggCaja._sum.deltaCaja));

      // 4) Política de base y disponible a depositar
      const baseDeseada = r2(
        Math.max(0, n(dto.dejarEnCaja ?? turno.fondoFijo ?? 0)),
      );
      const disponibleParaDepositar = Math.max(0, r2(enCaja - baseDeseada));

      // 5) Determinar monto de depósito según modo
      let montoDeposito = 0;
      switch (dto.modo) {
        case 'DEPOSITO_TODO':
          montoDeposito = disponibleParaDepositar;
          break;
        case 'DEPOSITO_PARCIAL':
          if (!dto.montoParcial || dto.montoParcial <= 0) {
            throw new BadRequestException('Monto parcial inválido');
          }
          montoDeposito = Math.min(
            disponibleParaDepositar,
            r2(n(dto.montoParcial)),
          );
          break;
        case 'SIN_DEPOSITO':
        case 'CAMBIO_TURNO':
          montoDeposito = 0;
          break;
        default:
          throw new BadRequestException('Modo de cierre no soportado');
      }
      montoDeposito = r2(montoDeposito);

      if (montoDeposito > 0 && !dto.cuentaBancariaId) {
        throw new BadRequestException(
          'Cuenta bancaria requerida para depósito',
        );
      }

      if (montoDeposito > 0) {
        if (!dto.comprobanteTipo) {
          throw new BadRequestException(
            'Tipo de comprobante requerido para depósito',
          );
        }
        if (!dto.comprobanteNumero?.trim()) {
          throw new BadRequestException(
            'Número de comprobante requerido para depósito',
          );
        }
      }

      // 6) Crear movimiento de depósito (si corresponde)
      let movDeposito: any = null;
      if (montoDeposito > 0.01) {
        const metodoPagoMF = metodoPagoFromComprobante(
          dto.comprobanteTipo as any,
        );
        const compNumero = toComprobanteNumero(dto.comprobanteNumero);

        movDeposito = await tx.movimientoFinanciero.create({
          data: {
            sucursalId: turno.sucursalId,
            registroCajaId: turno.id,
            fecha: ahora,
            clasificacion: 'TRANSFERENCIA', // ajusta a tu enum si aplica
            motivo: 'DEPOSITO_CIERRE', // idem
            // metodoPago: 'TRANSFERENCIA',
            // metodoPago: 'TRANSFERENCIA',
            metodoPago: metodoPagoMF,
            deltaCaja: -montoDeposito,
            deltaBanco: +montoDeposito,
            cuentaBancariaId: dto.cuentaBancariaId!,
            esDepositoCierre: true,
            descripcion: 'Depósito de cierre de turno',
            usuarioId: dto.usuarioCierreId,
            //comprobante
            comprobanteTipo: dto.comprobanteTipo as any,
            comprobanteNumero: compNumero,
            comprobanteFecha: dto.comprobanteFecha ?? ahora,
          },
        });
      }

      // 7) Cerrar turno (saldo final post-depósito) + snapshots
      const aggCaja2 = await tx.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { registroCajaId: turno.id },
      });
      const saldoFinal = r2(n(turno.saldoInicial) + n(aggCaja2._sum.deltaCaja));

      const cerrado = await tx.registroCaja.update({
        where: { id: turno.id },
        data: {
          estado: 'CERRADO',
          fechaCierre: ahora,
          saldoFinal,
          comentarioFinal: dto.comentarioFinal ?? null,
          depositado: montoDeposito > 0,
        },
      });

      // Snapshots (día sucursal y global) — NO filtran ventas POS
      await this.upsertSucursalSnapshot(tx, turno.sucursalId, ahora);
      await this.refreshGlobalSnapshot(tx, ahora);

      // 8) Apertura de siguiente turno (opcional)
      let nuevoTurno: any = null;
      if (dto.modo === 'CAMBIO_TURNO' && (dto.abrirSiguiente ?? true)) {
        const nextUser = dto.usuarioInicioSiguienteId ?? dto.usuarioCierreId;
        const nextFondo = n(dto.fondoFijoSiguiente ?? turno.fondoFijo ?? 0);

        nuevoTurno = await tx.registroCaja.create({
          data: {
            sucursalId: turno.sucursalId,
            usuarioInicioId: nextUser,
            saldoInicial: saldoFinal, // arrastra lo que quedó (normalmente = base)
            fondoFijo: nextFondo,
            comentario:
              dto.comentarioAperturaSiguiente ?? 'Apertura por cambio de turno',
            estado: 'ABIERTO',
          },
        });
      }

      // 9) Warnings útiles para UI
      const warnings: string[] = [];
      if (dto.asentarVentas !== false && saldoFinal < 0) {
        warnings.push('Saldo de caja quedó negativo.');
      }
      if (dto.modo === 'DEPOSITO_TODO' && saldoFinal > 0.01) {
        warnings.push(
          'Quedó efectivo en caja pese a "Depositar todo" (posible base > 0).',
        );
      }

      this.logger.log(
        `[CierreCaja] turno=${turno.id} ` +
          `enCajaAntes=${enCaja} baseDeseada=${baseDeseada} disponible=${disponibleParaDepositar} ` +
          `montoDeposito=${montoDeposito}`,
      );

      this.logger.log(
        `[CierreCaja] turno=${turno.id} saldoFinal=${saldoFinal} (esperado≈base ${baseDeseada})`,
      );

      return {
        turnoCerrado: {
          id: cerrado.id,
          saldoFinal,
          depositoRealizado: montoDeposito,
        },
        movimientos: { deposito: movDeposito },
        cajas: {
          enCajaAntes: enCaja,
          baseDejada: baseDeseada,
          disponibleParaDepositar,
        },
        ventas: { efectivoTurno: r2(ventasEfectivoTurno) },
        nuevoTurno,
        warnings,
      };
    });
  }

  /**
   * Saldo inicial sugerido:
   * - Si hay turno cerrado más reciente: usar su saldoFinal.
   * - Sino, usar snapshot diario (nuevo: saldoFinalCaja). Si aún no migras, usa tu campo anterior.
   * - Sino, 0.
   */
  private async getSaldoInicial(
    tx: PrismaService['$transaction']['arguments'][0],
    sucursalId: number,
  ): Promise<number> {
    // Último turno cerrado/arqueeado
    const ultima = await tx.registroCaja.findFirst({
      where: {
        sucursalId,
        estado: { in: [EstadoTurnoCaja.CERRADO, EstadoTurnoCaja.ARQUEO] },
      },
      orderBy: { fechaCierre: 'desc' },
      select: { saldoFinal: true },
    });
    if (ultima?.saldoFinal != null) {
      const sf = Number(ultima.saldoFinal);
      return Math.abs(sf) < 0.01 ? 0 : sf;
    }

    // Snapshot diario (si ya migraste a los nuevos campos)
    // ⚠️ Si aún no migraste, usa select: { saldoFinal: true }
    const snap = await tx.sucursalSaldoDiario.findFirst({
      where: { sucursalId },
      orderBy: { fecha: 'desc' },
      select: { saldoFinalCaja: true }, // <- nuevo esquema
      // select: { saldoFinal: true },   // <- antiguo
    });

    const fallback =
      (snap as any)?.saldoFinalCaja ?? (snap as any)?.saldoFinal ?? 0;
    return Number(fallback) || 0;
  }

  /**
   *
   * @param params ID de sucursal e usuarioID para encontrar la ultima caja abierta
   * @returns caja abierta con datos previos lista para cerrar
   */
  async conseguirCajaAbierta(sucursalId: number, userID: number) {
    const caja = await this.prisma.registroCaja.findFirst({
      where: {
        sucursalId,
        estado: EstadoTurnoCaja.ABIERTO,
        fechaCierre: null,
        usuarioInicioId: userID,
      },
      select: {
        id: true,
        saldoInicial: true,
        comentario: true,
        fechaApertura: true,
        estado: true,
        sucursal: { select: { id: true, nombre: true } },
        usuarioInicio: { select: { id: true, nombre: true } },
      },
    });

    if (!caja) return null;

    return {
      id: caja.id,
      saldoInicial: Number(caja.saldoInicial),
      comentario: caja.comentario ?? undefined,
      fechaApertura: caja.fechaApertura,
      sucursalId: caja.sucursal.id,
      sucursalNombre: caja.sucursal.nombre,
      usuarioInicioId: caja.usuarioInicio.id,
      usuarioInicioNombre: caja.usuarioInicio.nombre,
      estado: caja.estado,
    };
  }

  /**
   *
   * @returns Registros de cajas cerrados con toda la data necesaria para entender los movimientos
   */
  async getCajasRegistros() {}

  /**
   * Liga una venta al turno de caja abierto de su sucursal.
   * - Requiere caja abierta si la venta tiene pagos en EFECTIVO (configurable).
   * - Idempotente: si ya está ligada, no falla.
   */
  // Wrapper opcional: si alguien llama sin tx, abrimos una.
  async linkVentaToCaja(
    ventaID: number,
    sucursalID?: number,
    opts?: { exigirCajaSiEfectivo?: boolean },
  ) {
    return this.prisma.$transaction((tx) =>
      this.linkVentaToCajaTx(tx, ventaID, sucursalID, opts),
    );
  }

  async linkVentaToCajaTx(
    tx: Prisma.TransactionClient,
    ventaID: number,
    sucursalID?: number,
    opts?: { exigirCajaSiEfectivo?: boolean },
  ) {
    console.log('El id venta es: ', ventaID);

    const { exigirCajaSiEfectivo = true } = opts ?? {};
    await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;

    const venta = await tx.venta.findUnique({
      where: { id: ventaID },
      select: {
        id: true,
        totalVenta: true,
        registroCajaId: true,
        sucursalId: true,
        metodoPago: { select: { metodoPago: true } },
      },
    });
    if (!venta) throw new NotFoundException({ message: 'Venta no encontrada' });
    if (venta.registroCajaId) return venta;

    const sucursal = sucursalID ?? venta.sucursalId;
    if (!sucursal)
      throw new BadRequestException({ message: 'Venta sin sucursal asociada' });

    const requiereCaja =
      venta.metodoPago?.metodoPago === MetodoPago.CONTADO &&
      venta.totalVenta > 0;

    console.log('requiere caja? ', requiereCaja);

    const cajaAbierta = await tx.registroCaja.findFirst({
      where: { sucursalId: sucursal, estado: 'ABIERTO', fechaCierre: null },
      orderBy: { fechaApertura: 'desc' },
      select: { id: true },
    });

    console.log('La caja abierta es: ', cajaAbierta);

    if (!cajaAbierta) {
      if (requiereCaja && exigirCajaSiEfectivo) {
        throw new BadRequestException({
          message: 'No hay caja abierta para venta en efectivo.',
        });
      }
      return venta; // tarjeta/transferencia/crédito sin caja
    }

    // lock + re-chequeo
    const locked = await tx.$queryRaw<
      Array<{ estado: string; fechaCierre: Date | null }>
    >`
      SELECT estado, "fechaCierre" FROM "RegistroCaja"
      WHERE id = ${cajaAbierta.id}
      FOR UPDATE NOWAIT
    `;
    const stillOpen =
      locked.length === 1 &&
      locked[0].estado === 'ABIERTO' &&
      locked[0].fechaCierre === null;
    if (!stillOpen) {
      if (requiereCaja && exigirCajaSiEfectivo) {
        throw new BadRequestException({
          message: 'La caja se cerró durante el proceso.',
        });
      }
      return venta;
    }

    const ventaUdated = await tx.venta.updateMany({
      where: { id: ventaID, registroCajaId: null },
      data: { registroCajaId: cajaAbierta.id },
    });
    this.logger.log('La venta actualizada es: ', ventaUdated);

    return tx.venta.findUnique({
      where: { id: ventaID },
      select: { id: true, registroCajaId: true, sucursalId: true },
    });
  }

  /**
   *
   * @param cajaID ID DE LA CAJA
   * @returns ventas de la caja
   */
  // DTOs para la UI
  async getVentasLigadasACaja(
    cajaID: number,
    opts?: { page?: number; pageSize?: number; order?: 'asc' | 'desc' },
  ): Promise<VentaLigadaACajaDTO[]> {
    try {
      if (!Number.isInteger(cajaID) || cajaID <= 0) {
        throw new BadRequestException('ID no proporcionado o inválido');
      }

      const page = opts?.page ?? 1;
      const pageSize = opts?.pageSize ?? 50;
      const order = opts?.order ?? 'desc';

      const ventas = await this.prisma.venta.findMany({
        where: {
          registroCajaId: cajaID,
          metodoPago: {
            metodoPago: 'CONTADO',
          },
        },
        orderBy: { horaVenta: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          horaVenta: true,
          totalVenta: true,
          tipoComprobante: true,
          referenciaPago: true,
          metodoPago: { select: { metodoPago: true } }, // puede ser null si la FK es opcional
          productos: {
            select: {
              id: true,
              cantidad: true,
              estado: true,
              precioVenta: true,
              producto: {
                select: { id: true, nombre: true, codigoProducto: true },
              },
            },
          },
          cliente: { select: { id: true, nombre: true } }, // null si no tiene cliente
        },
      });

      const formattedData: VentaLigadaACajaDTO[] = ventas.map((v) => ({
        id: v.id,
        cliente: v.cliente
          ? { id: v.cliente.id, nombre: v.cliente.nombre }
          : null,
        totalVenta: v.totalVenta,
        tipoComprobante: v.tipoComprobante,
        referenciaPago: v.referenciaPago,
        metodoPago: v.metodoPago ?? null,
        horaVenta: v.horaVenta,
        productos: v.productos.map((p) => ({
          lineaId: p.id,
          precioVenta: p.precioVenta,
          estado: p.estado,
          cantidad: p.cantidad,
          productoId: p.producto.id,
          nombre: p.producto.nombre,
          codigoProducto: p.producto.codigoProducto,
        })),
      }));

      return formattedData;
    } catch (error) {
      this.logger.error('getVentasLigadasACaja error:', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({ message: 'Error inesperado' });
    }
  }

  /**
   *
   * @param
   * @returns data real sobre los totales del turno de la caja
   */
  async previewCierre(params: {
    registroCajaId?: number;
    sucursalId?: number;
    usuarioId?: number; // opcional para filtrar por quien abrió
  }) {
    const { registroCajaId, sucursalId, usuarioId } = params;
    this.logger.log(
      `EL PARAMS DEL GET DE LA CAJA AL CIERRE ES:\n${JSON.stringify(params, null, 2)}`,
    );
    // 1) Resolver el turno
    let turno = null as null | {
      id: number;
      saldoInicial: any;
      fondoFijo: any;
      sucursalId: number;
    };

    if (registroCajaId) {
      turno = (await this.prisma.registroCaja.findUnique({
        where: { id: registroCajaId },
        select: {
          id: true,
          saldoInicial: true,
          fondoFijo: true,
          sucursalId: true,
          estado: true,
        },
      })) as any;

      if (!turno || (turno as any).estado !== EstadoTurnoCaja.ABIERTO) {
        throw new BadRequestException('Turno no encontrado o ya cerrado');
      }
    } else {
      if (!sucursalId) {
        throw new BadRequestException('Falta registroCajaId o sucursalId');
      }
      turno = (await this.prisma.registroCaja.findFirst({
        where: {
          sucursalId,
          estado: EstadoTurnoCaja.ABIERTO,
          fechaCierre: null,
          ...(usuarioId ? { usuarioInicioId: usuarioId } : {}),
        },
        orderBy: { fechaApertura: 'desc' },
        select: {
          id: true,
          saldoInicial: true,
          fondoFijo: true,
          sucursalId: true,
        },
      })) as any;

      if (!turno) throw new BadRequestException('No hay caja abierta');
    }

    // 2) Agregados por deltas
    const [sumAll, sumIn, sumOut, sumDepositosCierre] = await Promise.all([
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { registroCajaId: turno.id },
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { registroCajaId: turno.id, deltaCaja: { gt: 0 } },
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { registroCajaId: turno.id, deltaCaja: { lt: 0 } },
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: {
          registroCajaId: turno.id,
          motivo: 'DEPOSITO_CIERRE',
          esDepositoCierre: true,
        },
      }),
    ]);

    const { saldoInicial, fondoFijo, enCaja, enCajaOperable, maxDeposito } =
      await this.utilities.getCajaEstado(this.prisma, turno.id);

    const ingresosEfectivo = Number(sumIn._sum.deltaCaja ?? 0); // (>0)
    const egresosEfectivo = Math.abs(Number(sumOut._sum.deltaCaja ?? 0)); // mostrar en positivo
    const depositosCierre = Math.abs(
      Number(sumDepositosCierre._sum.deltaCaja ?? 0),
    ); // también positivo

    //nuevos
    const enCajaReal = enCaja;
    // const enCajaOperable = Math.max(0, enCajaReal);

    // sugerencias y límites
    const sugeridoDepositarAuto = Math.max(0, enCajaReal - fondoFijo);
    const puedeDepositarHasta = enCajaOperable;

    // Opcional: redondeo a 2 decimales si lo usas
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      registroCajaId: turno.id,
      sucursalId: turno.sucursalId,
      saldoInicial,
      enCaja: round2(enCajaReal),
      enCajaOperable: round2(enCajaOperable), // << NUEVO
      fondoFijoActual: fondoFijo,
      sugeridoDepositarAuto: round2(sugeridoDepositarAuto),
      puedeDepositarHasta: round2(puedeDepositarHasta),
      desglose: {
        ingresosEfectivo,
        egresosEfectivo,
        depositosCierre,
      },
      warnings:
        enCajaReal < 0
          ? [
              'El saldo en caja es negativo. Revise los movimientos financieros o registre un ajuste (ingreso o sobrante) antes de cerrar la caja.',
            ]
          : [],
      timestamp: new Date().toISOString(),
    };
  }

  async deleteAllCajas() {
    // await this.prisma.movimientoCaja.deleteMany({});
    await this.prisma.sucursalSaldoDiario.deleteMany({});
    await this.prisma.saldoGlobalDiario.deleteMany({});
    await this.prisma.movimientoFinanciero.deleteMany({});

    await this.prisma.sucursalSaldoDiario.deleteMany({});
    await this.prisma.saldoGlobalDiario.deleteMany({});
    await this.prisma.venta.deleteMany({});

    return this.prisma.registroCaja.deleteMany({});
  }

  async getAllCajas() {
    return await this.prisma.registroCaja.findMany({
      include: {
        movimientos: true,
      },
    });
  }

  /**
   * Sugerencia de saldo para abrir caja a NIVEL SUCURSAL (no por usuario).
   * Preferimos el snapshot diario; si no existe, caemos al último turno cerrado.
   * Nota: NO bloquea por cajas abiertas en la sucursal (multiusuario).
   */
  async getUltimoSaldoSucursal(sucursalId: number): Promise<number> {
    // 1) Preferir snapshot más reciente (lo que “quedó” en sucursal)
    const snap = await this.prisma.sucursalSaldoDiario.findFirst({
      where: { sucursalId },
      orderBy: { fecha: 'desc' },
      select: { saldoFinalCaja: true },
    });
    if (snap) return Number(snap.saldoFinalCaja ?? 0);

    // 2) Fallback: último turno CERRADO/ARQUEO/AJUSTADO de la sucursal
    const ultima = await this.prisma.registroCaja.findFirst({
      where: {
        sucursalId,
        estado: {
          in: [
            EstadoTurnoCaja.CERRADO,
            EstadoTurnoCaja.ARQUEO,
            EstadoTurnoCaja.AJUSTADO,
          ],
        },
      },
      orderBy: { fechaCierre: 'desc' },
      select: { saldoFinal: true },
    });

    const sf = Number(ultima?.saldoFinal ?? 0);
    return Math.abs(sf) < 0.01 ? 0 : sf;
  }

  //NUEVO GET CAJAS A TABLE
  // ---------- LISTADO PRINCIPAL ----------
  async list(dto: GetCajasQueryDto): Promise<Paginated<any>> {
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? dto.limit : 10;
    const skip = (page - 1) * limit;

    const whereCaja: Prisma.RegistroCajaWhereInput = {};

    // if (dto.sucursalId) whereCaja.sucursalId = Number(dto.sucursalId);
    if (dto.estado) whereCaja.estado = dto.estado as EstadoTurnoCaja;

    if (typeof dto.depositado === 'string') {
      whereCaja.depositado = dto.depositado === 'true';
    }

    if (dto.fechaAperturaInicio || dto.fechaAperturaFin) {
      whereCaja.fechaApertura = {
        gte: dto.fechaAperturaInicio
          ? new Date(dto.fechaAperturaInicio)
          : undefined,
        lte: dto.fechaAperturaFin ? new Date(dto.fechaAperturaFin) : undefined,
      };
    }
    if (dto.fechaCierreInicio || dto.fechaCierreFin) {
      whereCaja.fechaCierre = {
        gte: dto.fechaCierreInicio
          ? new Date(dto.fechaCierreInicio)
          : undefined,
        lte: dto.fechaCierreFin ? new Date(dto.fechaCierreFin) : undefined,
      };
    }

    // Si hay filtros de movimiento, que al menos UNO matchee
    const movWhere = this.buildMovWhere(dto);
    if (Object.keys(movWhere).length) {
      whereCaja.movimientos = { some: movWhere };
    }

    const total = await this.prisma.registroCaja.count({ where: whereCaja });

    const cajas = await this.prisma.registroCaja.findMany({
      where: whereCaja,
      orderBy: { fechaApertura: 'desc' },
      skip,
      take: Number(limit),
      include: {
        sucursal: { select: { id: true, nombre: true } },
        usuarioInicio: { select: { id: true, nombre: true, correo: true } },
        usuarioCierre: { select: { id: true, nombre: true, correo: true } },
        movimientos: {
          where: Object.keys(movWhere).length ? movWhere : undefined,
          orderBy: { fecha: 'asc' },
          select: {
            id: true,
            creadoEn: true,
            actualizadoEn: true,
            fecha: true,
            descripcion: true,
            referencia: true,
            deltaCaja: true,
            deltaBanco: true,
            clasificacion: true,
            motivo: true,
            metodoPago: true,
            esDepositoCierre: true,
            esDepositoProveedor: true,
            cuentaBancaria: {
              select: { id: true, banco: true, alias: true, numero: true },
            },
            proveedor: { select: { id: true, nombre: true } },
            usuario: { select: { id: true, nombre: true, correo: true } },
          },
        },
        venta: {
          orderBy: { fechaVenta: 'asc' },
          select: {
            id: true,
            totalVenta: true,
            tipoComprobante: true,
            metodoPago: true,
            fechaVenta: true,
            referenciaPago: true,
            cliente: { select: { id: true, nombre: true } },
            productos: {
              select: {
                id: true,
                cantidad: true,
                precioVenta: true,
                estado: true,
                producto: {
                  select: {
                    id: true,
                    nombre: true,
                    descripcion: true,
                    codigoProducto: true,
                    imagenesProducto: {
                      select: { id: true, public_id: true, url: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const items = cajas.map((rc) => {
      const movimientos = rc.movimientos.map((m) => {
        const tipo = this.inferTipo(m);
        const categoria = this.inferCategoria(m);
        const monto = this.montoDesdeDeltas(m);

        const banco = m.cuentaBancaria?.banco
          ? m.cuentaBancaria.banco
          : (m.cuentaBancaria?.alias ?? null);

        return {
          id: m.id,
          creadoEn: m.creadoEn.toISOString(),
          actualizadoEn: m.actualizadoEn.toISOString(),
          banco,
          categoria,
          descripcion: m.descripcion ?? null,
          fecha: m.fecha.toISOString(),
          monto,
          numeroBoleta: this.maybeBoleta(m.referencia),
          referencia: m.referencia ?? null,
          tipo, // <- legacy TipoMovimientoCaja compatible
          usadoParaCierre: !!(
            m.esDepositoCierre || m.motivo === 'DEPOSITO_CIERRE'
          ),
          proveedor: m.proveedor
            ? { id: m.proveedor.id, nombre: m.proveedor.nombre }
            : null,
          usuario: m.usuario
            ? {
                id: m.usuario.id,
                nombre: m.usuario.nombre,
                correo: m.usuario.correo,
              }
            : null,
          // Nota: si alguna vez necesitas el signo real en FE, podemos agregar deltaCaja/deltaBanco como campos opcionales.
        };
      });

      const ventas = rc.venta.map((v) => ({
        id: v.id,
        totalVenta: this.toNum(v.totalVenta),
        tipoComprobante: v.tipoComprobante,
        metodoPago: v.metodoPago,
        fechaVenta: v.fechaVenta.toISOString(),
        referenciaPago: v.referenciaPago ?? 'N/A',
        cliente: v.cliente
          ? { id: v.cliente.id, nombre: v.cliente.nombre }
          : 'CF',
        productos: v.productos.map((vp, idx) => ({
          id: vp.id,
          cantidad: vp.cantidad,
          precioVenta: this.toNum(vp.precioVenta),
          estado: vp.estado,
          producto: {
            id: vp.producto.id,
            nombre: vp.producto.nombre,
            descripcion: vp.producto.descripcion,
            codigoProducto: vp.producto.codigoProducto,
            imagenesProducto: (vp.producto.imagenesProducto ?? []).map(
              (img, i) => ({
                id: img.id ?? i,
                public_id: img.public_id,
                url: img.url,
              }),
            ),
          },
        })),
      }));

      return {
        id: rc.id,
        creadoEn: rc.creadoEn.toISOString(),
        actualizadoEn: rc.actualizadoEn.toISOString(),
        comentarioInicial: rc.comentario ?? null,
        comentarioFinal: rc.comentarioFinal ?? null,
        depositado: rc.depositado,
        estado: rc.estado, // EstadoTurnoCaja -> string
        fechaApertura: rc.fechaApertura.toISOString(),
        fechaCierre: rc.fechaCierre
          ? rc.fechaCierre.toISOString()
          : (null as any),
        movimientoCaja: null,
        saldoInicial: this.toNum(rc.saldoInicial),
        saldoFinal: rc.saldoFinal == null ? 0 : this.toNum(rc.saldoFinal),
        ventasLenght: ventas.length,
        movimientosLenght: movimientos.length,
        usuarioInicio: rc.usuarioInicio
          ? {
              id: rc.usuarioInicio.id,
              nombre: rc.usuarioInicio.nombre,
              correo: rc.usuarioInicio.correo,
            }
          : null,
        usuarioCierre: rc.usuarioCierre
          ? {
              id: rc.usuarioCierre.id,
              nombre: rc.usuarioCierre.nombre,
              correo: rc.usuarioCierre.correo,
            }
          : null,
        sucursal: { id: rc.sucursal.id, nombre: rc.sucursal.nombre },
        movimientosCaja: movimientos,
        ventas,
      };
    });

    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      items,
    };
  }

  /**
   *
   * @param tx
   * @param ventaId
   * @param sucursalId
   * @param usuarioId
   * @param opts
   * @returns
   */
  async attachAndRecordSaleTx(
    tx: Prisma.TransactionClient,
    ventaId: number,
    sucursalId: number,
    usuarioId: number,
    opts?: { exigirCajaSiEfectivo?: boolean },
  ) {
    const { exigirCajaSiEfectivo = true } = opts ?? {};

    const venta = await tx.venta.findUnique({
      where: { id: ventaId },
      select: {
        id: true,
        totalVenta: true,
        registroCajaId: true,
        sucursalId: true,
        referenciaPago: true,
        usuarioId: true,
        metodoPago: { select: { metodoPago: true } },
      },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');

    const metodo = venta.metodoPago?.metodoPago ?? 'EFECTIVO';
    const esEfectivo = metodo === 'EFECTIVO' || metodo === 'CONTADO';
    const esCredito = metodo === 'CREDITO';

    // 1) Buscar turno SOLO si pretendemos tocar caja (efectivo)
    let turno: { id: number } | null = null;
    if (esEfectivo) {
      turno = await tx.registroCaja.findFirst({
        where: {
          sucursalId,
          usuarioInicioId: usuarioId,
          estado: 'ABIERTO',
          fechaCierre: null,
        },
        orderBy: { fechaApertura: 'desc' },
        select: { id: true },
      });

      if (!turno && exigirCajaSiEfectivo) {
        // ⛔ Sólo error si la política exige caja
        throw new BadRequestException(
          'No tienes una caja abierta en esta sucursal para registrar la venta en efectivo.',
        );
      }
    }

    // 2) Link a turno sólo si NO es crédito y SÍ hay turno
    const shouldLinkCaja = !esCredito && !!turno;
    if (shouldLinkCaja) {
      await tx.venta.updateMany({
        where: { id: venta.id, registroCajaId: null },
        data: { registroCajaId: turno!.id },
      });
    }

    // 3) Movimiento financiero (no para crédito)
    // if (!esCredito && venta.totalVenta > 0) {
    //   const afectaCaja = esEfectivo && !!turno; // sólo si hay turno
    //   const deltaCaja = afectaCaja ? venta.totalVenta : 0;
    //   const deltaBanco = !esEfectivo ? venta.totalVenta : 0;

    //   await tx.movimientoFinanciero.create({
    //     data: {
    //       fecha: new Date(),
    //       sucursalId,
    //       registroCajaId: afectaCaja ? turno!.id : null,
    //       clasificacion: 'INGRESO',
    //       motivo: 'VENTA',
    //       metodoPago: metodo, // usa el método real
    //       deltaCaja,
    //       deltaBanco,
    //       descripcion: `Venta #${venta.id}`,
    //       referencia: venta.referenciaPago ?? null,
    //       usuarioId: usuarioId ?? venta.usuarioId,
    //       esDepositoCierre: false,
    //       esDepositoProveedor: false,
    //       afectaInventario: false,
    //     },
    //   });
    // }

    if (!esCredito && venta.totalVenta > 0) {
      const afectaCaja = esEfectivo && !!turno;
      const deltaCaja = afectaCaja ? venta.totalVenta : 0;
      const deltaBanco = !esEfectivo ? venta.totalVenta : 0;

      if (deltaCaja > 0 || deltaBanco > 0) {
        await tx.movimientoFinanciero.create({
          data: {
            fecha: new Date(),
            sucursalId,
            registroCajaId: afectaCaja ? turno!.id : null,
            clasificacion: 'INGRESO',
            motivo: 'VENTA',
            metodoPago: metodo,
            deltaCaja,
            deltaBanco,
            descripcion: `Venta #${venta.id}`,
            referencia: venta.referenciaPago ?? null,
            usuarioId: usuarioId ?? venta.usuarioId,
            esDepositoCierre: false,
            esDepositoProveedor: false,
            afectaInventario: false,
          },
        });
      }
    }

    return { ventaId: venta.id, registroCajaId: turno?.id ?? null };
  }

  /**
   *
   * @param sucursalId SUCURSAL
   * @returns
   */
  async getCajasAbiertasToCompra(sucursalId: number) {
    try {
      const cajasAptas = await this.prisma.registroCaja.findMany({
        where: {
          estado: 'ABIERTO',
          depositado: false,
          fechaCierre: null,
        },
        select: {
          id: true,
          fechaApertura: true,
          estado: true,
          actualizadoEn: true,
          saldoInicial: true,
          usuarioInicioId: true,
          usuarioInicio: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      });

      const cajasCompletas = await Promise.all(
        cajasAptas.map(async (caja) => {
          const data = {
            registroCaja: caja.id,
            sucursalId,
            userId: caja.usuarioInicioId,
          };

          const saldosCaja = await this.previewCierre(data);
          return {
            ...caja,
            disponibleEnCaja: saldosCaja.enCajaOperable,
            // usuario: caja.usuarioInicio.nombre,
            // usuarioId: caja.usuarioInicio.id,
          };
        }),
      );

      return cajasCompletas;
    } catch (error) {
      this.logger.error('El error es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal Error: Error inesperado');
    }
  }

  async upsertSucursalSnapshot(
    tx: PrismaService['$transaction']['arguments'][0],
    sucursalId: number,
    fechaRef?: Date,
  ) {
    // Día en zona local (usa tu TZGT/IANA)
    const hoy = dayjs(fechaRef ?? new Date()).tz(TZGT);
    const fechaCorte = hoy.startOf('day').toDate(); // 00:00 local -> Date UTC
    const dayStart = hoy.startOf('day').toDate();
    const dayEnd = hoy.endOf('day').toDate();

    // 1) Agregados del día (deltaCaja/deltaBanco por signo)
    const [aggCajaIn, aggCajaOut, aggBanIn, aggBanOut, aperturasAgg] =
      await Promise.all([
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: dayStart, lte: dayEnd },
            deltaCaja: { gt: 0 },
          },
        }),
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: dayStart, lte: dayEnd },
            deltaCaja: { lt: 0 },
          },
        }),
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: dayStart, lte: dayEnd },
            deltaBanco: { gt: 0 },
          },
        }),
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: dayStart, lte: dayEnd },
            deltaBanco: { lt: 0 },
          },
        }),
        // 👇 SUMA de TODAS las aperturas del día (no la primera)
        tx.registroCaja.aggregate({
          _sum: { saldoInicial: true },
          where: { sucursalId, fechaApertura: { gte: dayStart, lte: dayEnd } },
        }),
      ]);

    // 2) Snapshot previo (día anterior) -> saldos de inicio de fallback
    const snapPrev = await tx.sucursalSaldoDiario.findFirst({
      where: { sucursalId, fecha: { lt: fechaCorte } },
      orderBy: { fecha: 'desc' },
      select: { saldoFinalCaja: true, saldoFinalBanco: true },
    });

    const sumaAperturas = Number(aperturasAgg._sum.saldoInicial ?? 0);
    const saldoInicioCaja = snapPrev
      ? Number(snapPrev.saldoFinalCaja ?? 0)
      : sumaAperturas;
    const saldoInicioBanco = snapPrev
      ? Number(snapPrev.saldoFinalBanco ?? 0)
      : 0;

    // 3) INICIOS correctos del día
    // const saldoInicioCaja = Number(
    //   apertura?.saldoInicial ?? snapPrev?.saldoFinalCaja ?? 0,
    // );
    // const saldoInicioBanco = Number(snapPrev?.saldoFinalBanco ?? 0);

    // 4) Movimientos del día
    const ingresosCaja = Number(aggCajaIn._sum.deltaCaja ?? 0);
    const egresosCajaAbs = Math.abs(Number(aggCajaOut._sum.deltaCaja ?? 0));
    const saldoFinalCaja = saldoInicioCaja + ingresosCaja - egresosCajaAbs;

    const ingresosBanco = Number(aggBanIn._sum.deltaBanco ?? 0);
    const egresosBancoAbs = Math.abs(Number(aggBanOut._sum.deltaBanco ?? 0));
    const saldoFinalBanco = saldoInicioBanco + ingresosBanco - egresosBancoAbs;

    // 5) UPSERT snapshot del día
    await tx.sucursalSaldoDiario.upsert({
      where: { sucursalId_fecha: { sucursalId, fecha: fechaCorte } },
      create: {
        sucursalId,
        fecha: fechaCorte,
        saldoInicioCaja,
        ingresosCaja,
        egresosCaja: egresosCajaAbs,
        saldoFinalCaja,
        saldoInicioBanco,
        ingresosBanco,
        egresosBanco: egresosBancoAbs,
        saldoFinalBanco,
      },
      update: {
        saldoInicioCaja,
        ingresosCaja,
        egresosCaja: egresosCajaAbs,
        saldoFinalCaja,
        saldoInicioBanco,
        ingresosBanco,
        egresosBanco: egresosBancoAbs,
        saldoFinalBanco,
      },
    });
  }

  /**
   * Recalcula el global del día desde todos los snapshots por sucursal.
   * También debe llamarse dentro de la MISMA $transaction que el cierre.
   */
  async refreshGlobalSnapshot(
    tx: PrismaService['$transaction']['arguments'][0],
    fechaRef?: Date,
  ) {
    const fechaCorte = dayjs(fechaRef ?? new Date())
      .tz(TZGT)
      .startOf('day')
      .toDate();

    const sum = await tx.sucursalSaldoDiario.aggregate({
      where: { fecha: fechaCorte },
      _sum: {
        saldoFinalCaja: true,
        ingresosCaja: true,
        egresosCaja: true,
        saldoFinalBanco: true,
        ingresosBanco: true,
        egresosBanco: true,
      },
    });

    await tx.saldoGlobalDiario.upsert({
      where: { fecha: fechaCorte },
      create: {
        fecha: fechaCorte,
        saldoTotalCaja: Number(sum._sum.saldoFinalCaja ?? 0),
        ingresosTotalCaja: Number(sum._sum.ingresosCaja ?? 0),
        egresosTotalCaja: Number(sum._sum.egresosCaja ?? 0),
        saldoTotalBanco: Number(sum._sum.saldoFinalBanco ?? 0),
        ingresosTotalBanco: Number(sum._sum.ingresosBanco ?? 0),
        egresosTotalBanco: Number(sum._sum.egresosBanco ?? 0),
      },
      update: {
        saldoTotalCaja: Number(sum._sum.saldoFinalCaja ?? 0),
        ingresosTotalCaja: Number(sum._sum.ingresosCaja ?? 0),
        egresosTotalCaja: Number(sum._sum.egresosCaja ?? 0),
        saldoTotalBanco: Number(sum._sum.saldoFinalBanco ?? 0),
        ingresosTotalBanco: Number(sum._sum.ingresosBanco ?? 0),
        egresosTotalBanco: Number(sum._sum.egresosBanco ?? 0),
      },
    });
  }

  /**
   *
   * @param tx
   * @param metodoPago
   * @param usuarioId
   * @param sucursalId
   * @param monto
   */
  async generateMovimientoFinanciero(
    tx: Prisma.TransactionClient,
    metodoPago: MetodoPago,
    usuarioId: number,
    sucursalId: number,
    monto: number,
  ) {
    try {
      const isNecesaryCash =
        metodoPago === 'CONTADO' || metodoPago === 'EFECTIVO';

      if (isNecesaryCash) {
        const turnoFound = await tx.registroCaja.findFirst({
          where: {
            sucursalId: sucursalId,
            estado: 'ABIERTO',
          },
        });
      }
    } catch (error) {
      this.logger.error(
        'Error en generar movimiento financiero service de utilidad',
      );
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  /**
   * Sugerencia de saldo para abrir la próxima caja del USUARIO:
   * - Si el usuario YA tiene una caja abierta en la sucursal => 0 (no debe abrir otra).
   * - Si no, toma el saldoFinal del ÚLTIMO turno CERRADO/ARQUEO/AJUSTADO de ese usuario.
   * - Si no hay historial, 0.
   */
  async getUltimoSaldoUsuario(
    sucursalId: number,
    userId: number,
  ): Promise<number> {
    // ¿este usuario ya tiene una caja abierta?
    const abiertaUser = await this.prisma.registroCaja.findFirst({
      where: {
        sucursalId,
        usuarioInicioId: userId,
        estado: EstadoTurnoCaja.ABIERTO,
        fechaCierre: null,
      },
      select: { id: true },
    });
    if (abiertaUser) return 0;

    // último turno del usuario (cerrado/arqueo/ajustado)
    const ultimaUser = await this.prisma.registroCaja.findFirst({
      where: {
        sucursalId,
        usuarioInicioId: userId,
        estado: {
          in: [
            EstadoTurnoCaja.CERRADO,
            EstadoTurnoCaja.ARQUEO,
            EstadoTurnoCaja.AJUSTADO,
          ],
        },
      },
      orderBy: { fechaCierre: 'desc' },
      select: { saldoFinal: true },
    });

    const sf = Number(ultimaUser?.saldoFinal ?? 0);
    return Math.abs(sf) < 0.01 ? 0 : sf;
  }
}
