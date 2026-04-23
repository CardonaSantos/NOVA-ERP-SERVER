import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateMovimientoFinancieroDto } from './dto/create-movimiento-financiero.dto';
import { UpdateMovimientoFinancieroDto } from './dto/update-movimiento-financiero.dto';
import {
  ClasificacionAdmin,
  CostoVentaTipo,
  EstadoTurnoCaja,
  GastoOperativoTipo,
  MotivoMovimiento,
  OrigenAsientoContable,
  Prisma,
} from '@prisma/client';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilitiesService } from 'src/utilities/utilities.service';
import { CreateMFUtility } from './utilities/createMFDto';
import { ReglaContableService } from 'src/contabilidad/regla-contable/app/regla-contable.service';
import { AsientoContableService } from 'src/contabilidad/asiento-contable/app/asiento-contable.service';
type Tx = Prisma.TransactionClient;
@Injectable()
export class MovimientoFinancieroService {
  private readonly logger = new Logger(MovimientoFinancieroService.name);
  constructor(
    private prisma: PrismaService,
    private readonly utilitiesService: UtilitiesService,
    private readonly reglaContableService: ReglaContableService,
    private readonly asientoContableService: AsientoContableService,
  ) {}

  async crearMovimiento(dto: CrearMovimientoDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1) Calcula efectos operativos como ya lo haces
      const effects = this.mapMotivoToEffects(dto);
      const afectaInventario = this.afectaInventario(dto.motivo);

      const monto = Number(dto.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        throw new BadRequestException('El monto debe ser mayor a 0');
      }

      // 2) Validaciones de efectivo/caja dentro de la misma transacción
      if (dto.registroCajaId && effects.deltaCaja !== 0) {
        await this.utilitiesService.validarMovimientoEfectivo(
          tx,
          dto.registroCajaId,
          effects.deltaCaja,
        );
      }

      if (dto.motivo === MotivoMovimiento.DEPOSITO_CIERRE) {
        if (!dto.registroCajaId) {
          throw new BadRequestException(
            'El depósito de cierre requiere un registroCajaId',
          );
        }

        await this.utilitiesService.validarDepositoCierre(
          tx,
          dto.registroCajaId,
          monto,
        );
      }

      // 3) Guarda el movimiento financiero base
      const movimiento = await tx.movimientoFinanciero.create({
        data: {
          fecha: new Date(),
          sucursal: {
            connect: { id: dto.sucursalId },
          },
          registroCaja: dto.registroCajaId
            ? {
                connect: { id: dto.registroCajaId },
              }
            : undefined,
          clasificacion: effects.clasificacion,
          motivo: dto.motivo,
          metodoPago: dto.metodoPago ?? null,

          deltaCaja: effects.deltaCaja,
          deltaBanco: effects.deltaBanco,

          cuentaBancaria: dto.cuentaBancariaId
            ? {
                connect: { id: dto.cuentaBancariaId },
              }
            : undefined,

          descripcion: dto.descripcion ?? null,
          referencia: dto.referencia ?? null,
          conFactura: false,

          esDepositoCierre: dto.motivo === MotivoMovimiento.DEPOSITO_CIERRE,
          esDepositoProveedor:
            dto.motivo === MotivoMovimiento.DEPOSITO_PROVEEDOR,

          proveedor: dto.proveedorId
            ? {
                connect: { id: dto.proveedorId },
              }
            : undefined,

          gastoOperativoTipo: dto.gastoOperativoTipo ?? null,
          costoVentaTipo: dto.costoVentaTipo ?? null,
          afectaInventario,

          usuario: {
            connect: { id: dto.usuarioId },
          },

          // si tu modelo ya tiene estos campos, déjalos;
          // si no los tiene, quítalos
          // asientoContableId: null,
        },
      });

      // 4) Resuelve la regla contable
      const regla = await this.reglaContableService.resolverRegla(
        {
          origen: OrigenAsientoContable.MOVIMIENTO_FINANCIERO,
          clasificacion: effects.clasificacion,
          motivo: dto.motivo,
          metodoPago: dto.metodoPago,
        },
        tx,
      );

      // 5) Crea el asiento contable posteado
      const asiento = await this.asientoContableService.crearDesdeRegla(
        {
          descripcion: dto.descripcion
            ? `Movimiento financiero: ${dto.descripcion}`
            : `Movimiento financiero #${movimiento.id}`,
          origen: OrigenAsientoContable.MOVIMIENTO_FINANCIERO,
          origenId: movimiento.id,
          monto,
          cuentaDebeId: regla.getCuentaDebeId(),
          cuentaHaberId: regla.getCuentaHaberId(),
        },
        tx,
      );

      // 6) Si tu tabla movimientoFinanciero ya tiene asientoContableId, enlázalo
      //    Si todavía no lo tiene, puedes omitir esta parte por ahora
      await tx.movimientoFinanciero.update({
        where: { id: movimiento.id },
        data: {
          asientoContableId: asiento.getId(),
        },
      });

      return movimiento;
    });
  }

  private mapMotivoToEffects(dto: CrearMovimientoDto) {
    const m = dto.motivo;
    const x = Number(dto.monto);

    let clasificacion: ClasificacionAdmin = ClasificacionAdmin.TRANSFERENCIA;
    let deltaCaja = 0;
    let deltaBanco = 0;

    const esEfectivo = dto.metodoPago === 'EFECTIVO';

    // helpers para DRY
    const ingreso = () => {
      if (esEfectivo) deltaCaja = +x;
      else deltaBanco = +x;
    };
    const egreso = () => {
      if (esEfectivo) deltaCaja = -x;
      else deltaBanco = -x;
    };

    switch (m) {
      case MotivoMovimiento.VENTA: {
        // Venta de contado (ingreso inmediato)
        clasificacion = ClasificacionAdmin.INGRESO; // o INGRESO_OPERATIVO si lo tienes
        ingreso();
        break;
      }

      case MotivoMovimiento.COBRO_CREDITO: {
        // Anticipos y cuotas de un crédito
        clasificacion = ClasificacionAdmin.INGRESO; // o INGRESO_OPERATIVO si existe en tu enum
        ingreso(); // ✅ +x a caja o banco según método
        break;
      }

      case MotivoMovimiento.BANCO_A_CAJA: {
        clasificacion = ClasificacionAdmin.TRANSFERENCIA;
        deltaCaja = +x; // entra efectivo a caja
        deltaBanco = -x; // sale del banco
        break;
      }

      case MotivoMovimiento.OTRO_INGRESO: {
        clasificacion = ClasificacionAdmin.INGRESO;
        ingreso();
        break;
      }

      case MotivoMovimiento.GASTO_OPERATIVO: {
        clasificacion = ClasificacionAdmin.GASTO_OPERATIVO;
        egreso();
        break;
      }

      case MotivoMovimiento.COMPRA_MERCADERIA:
      case MotivoMovimiento.COSTO_ASOCIADO: {
        clasificacion = ClasificacionAdmin.COSTO_VENTA;
        egreso();
        break;
      }

      case MotivoMovimiento.DEPOSITO_CIERRE: {
        clasificacion = ClasificacionAdmin.TRANSFERENCIA;
        deltaCaja = -x;
        deltaBanco = +x;
        break;
      }

      case MotivoMovimiento.DEPOSITO_PROVEEDOR: {
        clasificacion = ClasificacionAdmin.COSTO_VENTA;
        deltaCaja = -x;
        deltaBanco = 0;
        break;
      }

      case MotivoMovimiento.PAGO_PROVEEDOR_BANCO: {
        clasificacion = ClasificacionAdmin.COSTO_VENTA;
        deltaCaja = 0;
        deltaBanco = -x;
        break;
      }

      case MotivoMovimiento.AJUSTE_SOBRANTE: {
        clasificacion = ClasificacionAdmin.AJUSTE;
        deltaCaja = +x;
        break;
      }

      case MotivoMovimiento.AJUSTE_FALTANTE: {
        clasificacion = ClasificacionAdmin.AJUSTE;
        deltaCaja = -x;
        break;
      }

      case MotivoMovimiento.DEVOLUCION: {
        clasificacion = ClasificacionAdmin.CONTRAVENTA;
        egreso(); // devuelve dinero al cliente (caja o banco)
        break;
      }

      case MotivoMovimiento.PAGO_CREDITO: {
        // o PAGO_CXP / PAGO_PROVEEDOR
        clasificacion = ClasificacionAdmin.COSTO_VENTA;
        if (esEfectivo) deltaCaja = -x;
        else deltaBanco = -x;
        break;
      }

      default:
        throw new BadRequestException('Motivo no soportado');
    }

    // Cualquier caso que toque caja requiere turno abierto
    const necesitaTurno = deltaCaja !== 0;

    return { clasificacion, deltaCaja, deltaBanco, necesitaTurno };
  }

  private afectaInventario(motivo: MotivoMovimiento) {
    return motivo === MotivoMovimiento.COMPRA_MERCADERIA; // recepción de compra
  }

  async getMovimientosFinancierosSimple() {
    return this.prisma.movimientoFinanciero.findMany({
      include: {
        cuentaBancaria: true,
        registroCaja: true,
      },
    });
  }

  /**
   * Servicio utilitario para crear movimientos financieros
   * @param rawDto DTO PARA CREAR UN MOVIMIENTO FINANCIERO
   * @param opts Transaccion o permitir turno ajeno
   * @returns
   */
  async createMovimiento(
    rawDto: CreateMFUtility,
    opts?: { tx?: Tx; permitirTurnoAjeno?: boolean },
  ) {
    const run = async (tx: Tx) => {
      const dto = { ...rawDto };
      const monto = Number(dto.monto);

      if (!isFinite(monto) || monto <= 0) {
        throw new BadRequestException('Monto debe ser mayor a 0.');
      }

      // A) Normalizar metodoPago (solo si falta)
      if (!dto.metodoPago) {
        if (
          dto.motivo === 'DEPOSITO_CIERRE' ||
          dto.motivo === 'PAGO_PROVEEDOR_BANCO' ||
          dto.motivo === 'BANCO_A_CAJA'
        ) {
          dto.metodoPago = 'TRANSFERENCIA';
        } else {
          dto.metodoPago = dto.cuentaBancariaId ? 'TRANSFERENCIA' : 'EFECTIVO';
        }
      }

      // B) Derivar efectos (no tocar DB)
      const { clasificacion, deltaCaja, deltaBanco } =
        this.mapMotivoToEffects(dto); // tu función existente

      const afectaCaja = Number(deltaCaja) !== 0;
      const afectaBanco = Number(deltaBanco) !== 0;
      this.logger.debug(
        `[MF] motivo=${dto.motivo} metodo=${dto.metodoPago} monto=${dto.monto} ` +
          `=> deltaCaja=${deltaCaja} deltaBanco=${deltaBanco}`,
      );

      if (!afectaCaja && !afectaBanco) {
        throw new BadRequestException(
          'El movimiento no afecta ni caja ni banco.',
        );
      }

      // C) Reglas método↔efectos
      const esDepositoCierre =
        dto.motivo === 'DEPOSITO_CIERRE' || !!dto.esDepositoCierre;
      const esBancoACaja = dto.motivo === 'BANCO_A_CAJA';

      if (dto.metodoPago === 'EFECTIVO' && afectaBanco) {
        throw new BadRequestException('Efectivo no puede afectar banco.');
      }
      if (
        dto.metodoPago !== 'EFECTIVO' &&
        afectaCaja &&
        !(esDepositoCierre || esBancoACaja)
      ) {
        throw new BadRequestException(
          'Un movimiento no-efectivo no debe afectar caja (salvo depósito de cierre o banco→caja).',
        );
      }

      // D) Resolver/validar turno de caja si aplica
      let registroCajaId = dto.registroCajaId ?? null;
      if (afectaCaja) {
        if (!registroCajaId) {
          const abierto = await tx.registroCaja.findFirst({
            where: {
              sucursalId: dto.sucursalId,
              usuarioInicioId: dto.usuarioId,
              estado: EstadoTurnoCaja.ABIERTO,
              fechaCierre: null,
            },
            orderBy: { fechaApertura: 'desc' },
            select: { id: true },
          });
          if (!abierto) {
            throw new BadRequestException(
              'No tienes una caja abierta en esta sucursal para movimientos en efectivo.',
            );
          }
          registroCajaId = abierto.id;
        } else {
          const turno = await tx.registroCaja.findUnique({
            where: { id: registroCajaId },
            select: {
              id: true,
              estado: true,
              sucursalId: true,
              usuarioInicioId: true,
            },
          });
          if (!turno || turno.estado !== EstadoTurnoCaja.ABIERTO) {
            throw new BadRequestException('Turno no encontrado o ya cerrado.');
          }
          if (turno.sucursalId !== dto.sucursalId) {
            throw new BadRequestException(
              'El turno pertenece a otra sucursal.',
            );
          }
          if (
            turno.usuarioInicioId !== dto.usuarioId &&
            !opts?.permitirTurnoAjeno
          ) {
            throw new BadRequestException(
              'El turno no pertenece a este usuario.',
            );
          }
        }

        // Lock optimista anti-carrera
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        await tx.$queryRaw`
          SELECT id FROM "RegistroCaja"
          WHERE id = ${registroCajaId}
          FOR UPDATE NOWAIT`;
      } else {
        if (dto.registroCajaId) {
          throw new BadRequestException(
            'Movimientos solo bancarios no deben adjuntar registroCajaId.',
          );
        }
      }

      // E) Reglas de banco
      if (afectaBanco) {
        if (!dto.cuentaBancariaId) {
          throw new BadRequestException(
            'Cuenta bancaria requerida para movimientos bancarios.',
          );
        }
      } else if (dto.cuentaBancariaId) {
        throw new BadRequestException(
          'No envíes cuenta bancaria si el movimiento no afecta banco.',
        );
      }

      // F) Reglas especiales
      if (esDepositoCierre) {
        if (!(deltaCaja < 0 && deltaBanco > 0)) {
          throw new BadRequestException(
            'Depósito de cierre debe mover caja(-) y banco(+).',
          );
        }
        if (!registroCajaId)
          throw new BadRequestException('Depósito de cierre requiere turno.');
        if (!dto.cuentaBancariaId) {
          throw new BadRequestException(
            'Depósito de cierre requiere cuenta bancaria destino.',
          );
        }
      }

      if (esBancoACaja) {
        if (!(deltaCaja > 0 && deltaBanco < 0)) {
          throw new BadRequestException(
            'Banco→Caja debe mover caja(+) y banco(-).',
          );
        }
        if (!registroCajaId)
          throw new BadRequestException('Banco→Caja requiere turno.');
        if (!dto.cuentaBancariaId) {
          throw new BadRequestException(
            'Banco→Caja requiere cuenta bancaria origen.',
          );
        }
      }

      if (dto.esDepositoProveedor) {
        if (
          !(
            afectaCaja &&
            deltaCaja < 0 &&
            !afectaBanco &&
            clasificacion === ClasificacionAdmin.COSTO_VENTA
          )
        ) {
          throw new BadRequestException(
            'Depósito a proveedor debe ser egreso de caja y costo de venta.',
          );
        }
      }

      // G) Pre-guards efectivo (anti caja negativa + depósito cierre válido)
      if (afectaCaja && registroCajaId) {
        await this.utilitiesService.validarMovimientoEfectivo(
          tx,
          registroCajaId,
          Number(deltaCaja),
        );
        if (esDepositoCierre) {
          await this.utilitiesService.validarDepositoCierre(
            tx,
            registroCajaId,
            Math.abs(Number(deltaCaja)),
          );
        }
      }
      this.logger.log('el id de la caja encontrada es: ', registroCajaId);
      // H) Crear (usar FK escalares para evitar connect indefinidos)
      const mov = await tx.movimientoFinanciero.create({
        data: {
          sucursalId: dto.sucursalId,
          usuarioId: dto.usuarioId,
          registroCajaId: registroCajaId ?? null,
          cuentaBancariaId: dto.cuentaBancariaId ?? null,
          proveedorId: dto.proveedorId ?? null,

          clasificacion,
          motivo: dto.motivo,
          metodoPago: dto.metodoPago ?? null,
          deltaCaja,
          deltaBanco,
          descripcion: dto.descripcion ?? null,
          referencia: dto.referencia ?? null,
          esDepositoCierre: !!dto.esDepositoCierre,
          esDepositoProveedor: !!dto.esDepositoProveedor,
          gastoOperativoTipo: (dto.gastoOperativoTipo as any) ?? null,
          costoVentaTipo: dto.costoVentaTipo ?? null,
          afectaInventario: this.afectaInventario(dto.motivo),
        },
      });

      // I) Re-chequeo caja
      if (afectaCaja && registroCajaId) {
        const { enCaja } = await this.utilitiesService.getCajaEstado(
          tx,
          registroCajaId,
        );
        if (enCaja < 0)
          throw new Error('Caja negativa tras el movimiento; rollback.');
      }

      return mov;
    };

    if (opts?.tx) return run(opts.tx);
    return this.prisma.$transaction((tx) => run(tx), {
      isolationLevel: 'Serializable',
    });
  }
}
