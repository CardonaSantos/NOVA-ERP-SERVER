import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateMovimientosCajaDto } from './dto/create-movimientos-caja.dto';
import { UpdateMovimientosCajaDto } from './dto/update-movimientos-caja.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PageOptionsDto } from 'src/utils/page-options';
import { ClasificacionAdmin, MotivoMovimiento, Prisma } from '@prisma/client';
import { MovimientosQueryDto } from './dto/movimientos-query.dto';
type Paged<T> = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: T[];
};

@Injectable()
export class MovimientosCajasService {
  private readonly logger = new Logger(MovimientosCajasService.name);
  constructor(private readonly prisma: PrismaService) {}
  // Helpers
  private num(n: any): number {
    return n == null ? 0 : Number(n);
  }
  private isZero(n: any): boolean {
    return Math.abs(this.num(n)) < 0.000001;
  }
  private maskNumero(num?: string | null): string | null {
    if (!num) return null;
    return `****${num.slice(-4)}`;
  }
  private maybeBoleta(ref?: string | null): string | null {
    if (!ref) return null;
    return /^[0-9]{4,}$/.test(ref) ? ref : null;
  }

  // Inferencias legacy (desde deltas + motivo/flags)
  private inferTipo(m: any): string {
    const dc = this.num(m.deltaCaja);
    const db = this.num(m.deltaBanco);
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
    if (m.clasificacion === 'INGRESO') return 'INGRESO';

    return null;
  }
  private montoDesdeDeltas(m: any): number {
    const dc = this.num(m.deltaCaja);
    const db = this.num(m.deltaBanco);
    if (!this.isZero(dc)) return Math.abs(dc);
    return Math.abs(db);
  }
  // -------- where dinámico (nuevo modelo) --------
  private buildWhere(
    q: MovimientosQueryDto,
  ): Prisma.MovimientoFinancieroWhereInput {
    const AND: Prisma.MovimientoFinancieroWhereInput[] = [];

    // sucursal
    if (q.sucursalId) AND.push({ sucursalId: q.sucursalId });

    // rango de fechas
    if (q.fechaInicio || q.fechaFin) {
      AND.push({
        fecha: {
          gte: q.fechaInicio ? new Date(q.fechaInicio) : undefined,
          lte: q.fechaFin ? new Date(q.fechaFin) : undefined,
        },
      });
    }

    // usadoParaCierre -> esDepositoCierre
    if (typeof q.usadoParaCierre === 'string') {
      const val = q.usadoParaCierre === 'true';
      AND.push({ esDepositoCierre: val });
    }

    // search
    if (q.search?.trim()) {
      const s = q.search.trim();
      AND.push({
        OR: [
          { descripcion: { contains: s, mode: 'insensitive' } },
          { referencia: { contains: s, mode: 'insensitive' } },
          { cuentaBancaria: { banco: { contains: s, mode: 'insensitive' } } },
          { proveedor: { nombre: { contains: s, mode: 'insensitive' } } },
          { usuario: { nombre: { contains: s, mode: 'insensitive' } } },
        ],
      });
    }

    // tipo[] (legacy -> deltas/motivo)
    if (q.tipo?.length) {
      const OR: Prisma.MovimientoFinancieroWhereInput[] = [];
      for (const t of q.tipo) {
        switch (t) {
          case 'VENTA':
            OR.push({ motivo: MotivoMovimiento.VENTA });
            break;
          case 'INGRESO':
            OR.push({ deltaCaja: { gt: 0 } });
            break;
          case 'EGRESO':
            OR.push({ deltaCaja: { lt: 0 } });
            break;
          case 'DEPOSITO_BANCO':
            OR.push({
              OR: [{ deltaBanco: { gt: 0 } }, { esDepositoCierre: true }],
            });
            break;
          case 'RETIRO':
            OR.push({ deltaBanco: { lt: 0 } });
            break;
          case 'TRANSFERENCIA':
            OR.push({
              AND: [{ deltaCaja: { lt: 0 } }, { deltaBanco: { gt: 0 } }],
            });
            break;
          case 'DEVOLUCION':
            OR.push({ motivo: MotivoMovimiento.DEVOLUCION });
            break;
          default:
            break;
        }
      }
      if (OR.length) AND.push({ OR });
    }

    // categoria[] (legacy -> flags/clasificación)
    if (q.categoria?.length) {
      const OR: Prisma.MovimientoFinancieroWhereInput[] = [];
      for (const c of q.categoria) {
        switch (c) {
          case 'DEPOSITO_CIERRE':
            OR.push({ esDepositoCierre: true });
            break;
          case 'DEPOSITO_PROVEEDOR':
            OR.push({ esDepositoProveedor: true });
            break;
          case 'GASTO_OPERATIVO':
            OR.push({ clasificacion: ClasificacionAdmin.GASTO_OPERATIVO });
            break;
          case 'COSTO_VENTA':
            OR.push({ clasificacion: ClasificacionAdmin.COSTO_VENTA });
            break;
          default:
            break;
        }
      }
      if (OR.length) AND.push({ OR });
    }

    return AND.length ? { AND } : {};
  }

  /**
   *
   * @param query Query en formato QS para traer registros de movmientos
   * @returns
   */
  async getMovimientosCaja(query: MovimientosQueryDto) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 10;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query);

    const [total, registros] = await this.prisma.$transaction([
      this.prisma.movimientoFinanciero.count({ where }),
      this.prisma.movimientoFinanciero.findMany({
        where,
        take: limit,
        skip,
        orderBy: { fecha: 'desc' },
        select: {
          id: true,
          creadoEn: true,
          actualizadoEn: true,
          fecha: true,
          descripcion: true,
          referencia: true,
          conFactura: true,

          deltaCaja: true,
          deltaBanco: true,

          clasificacion: true,
          motivo: true,
          metodoPago: true,

          esDepositoCierre: true,
          esDepositoProveedor: true,

          gastoOperativoTipo: true,
          costoVentaTipo: true,
          afectaInventario: true,

          cuentaBancaria: {
            select: { id: true, banco: true, alias: true, numero: true },
          },

          proveedor: { select: { id: true, nombre: true } },
          usuario: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },

          registroCaja: {
            select: {
              id: true,
              comentario: true,
              comentarioFinal: true,
              fechaApertura: true,
              fechaCierre: true,
              saldoInicial: true,
              saldoFinal: true,
              estado: true,
              depositado: true,
              creadoEn: true,
              actualizadoEn: true,
              sucursal: { select: { id: true, nombre: true } },
            },
          },
        },
      }),
    ]);

    const items = registros.map((m) => {
      const tipo = this.inferTipo(m);
      const categoria = this.inferCategoria(m);
      const monto = this.montoDesdeDeltas(m);

      const bancoNombre =
        m.cuentaBancaria?.banco ?? m.cuentaBancaria?.alias ?? null;

      return {
        // ---- legacy fields (tu UI actual) ----
        id: m.id,
        creadoEn: m.creadoEn.toISOString(),
        actualizadoEn: m.actualizadoEn.toISOString(),
        banco: bancoNombre,
        categoria, // CategoriaMovimiento | null
        descripcion: m.descripcion ?? null,
        fecha: m.fecha.toISOString(),
        monto, // magnitud positiva
        numeroBoleta: this.maybeBoleta(m.referencia),
        referencia: m.referencia ?? null,
        tipo, // TipoMovimientoCaja compatible
        usadoParaCierre: !!m.esDepositoCierre,
        usuario: m.usuario
          ? {
              id: m.usuario.id,
              nombre: m.usuario.nombre,
              rol: m.usuario.rol,
              correo: m.usuario.correo,
            }
          : null,
        proveedor: m.proveedor
          ? { id: m.proveedor.id, nombre: m.proveedor.nombre }
          : null,
        caja: m.registroCaja
          ? {
              id: m.registroCaja.id,
              comentario: m.registroCaja.comentario ?? null,
              comentarioFinal: m.registroCaja.comentarioFinal ?? null,
              fechaApertura: m.registroCaja.fechaApertura.toISOString(),
              fechaCierre: m.registroCaja.fechaCierre
                ? m.registroCaja.fechaCierre.toISOString()
                : null,
              saldoInicial: Number(m.registroCaja.saldoInicial),
              saldoFinal:
                m.registroCaja.saldoFinal == null
                  ? 0
                  : Number(m.registroCaja.saldoFinal),
              estado: m.registroCaja.estado as any,
              depositado: m.registroCaja.depositado,
              creadoEn: m.registroCaja.creadoEn.toISOString(),
              actualizadoEn: m.registroCaja.actualizadoEn.toISOString(),
              sucursal: m.registroCaja.sucursal
                ? {
                    id: m.registroCaja.sucursal.id,
                    nombre: m.registroCaja.sucursal.nombre,
                  }
                : null,
            }
          : null,

        // ---- NUEVO modelo (opcionales) ----
        clasificacion: m.clasificacion,
        motivo: m.motivo,
        metodoPago: m.metodoPago ?? null,

        deltaCaja: this.num(m.deltaCaja),
        deltaBanco: this.num(m.deltaBanco),

        esDepositoCierre: m.esDepositoCierre,
        esDepositoProveedor: m.esDepositoProveedor,

        gastoOperativoTipo: m.gastoOperativoTipo ?? null,
        costoVentaTipo: m.costoVentaTipo ?? null,
        afectaInventario: m.afectaInventario,

        cuentaBancaria: m.cuentaBancaria
          ? {
              id: m.cuentaBancaria.id,
              banco: m.cuentaBancaria.banco ?? null,
              alias: m.cuentaBancaria.alias ?? null,
              numeroMasked: this.maskNumero(m.cuentaBancaria.numero),
            }
          : null,
      };
    });

    const response = {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      items,
    };

    // Soporte opcional: agrupado por sucursal (si lo usas más adelante)
    if (query.groupBySucursal === 'true') {
      const by = new Map<number | 'NA', any>();
      for (const it of items) {
        const key = it.caja?.sucursal?.id ?? 'NA';
        if (!by.has(key))
          by.set(key, {
            sucursal: it.caja?.sucursal ?? null,
            movimientos: [] as typeof items,
          });
        by.get(key).movimientos.push(it);
      }
      return { ...response, itemsBySucursal: Array.from(by.values()) };
    }

    return response;
  }

  /**
   * Detalle de movimiento financiero mapeado a tu MovimientoCajaDetail (legacy + extras opcionales)
   */
  async getMovimientoCajaById(id: number) {
    try {
      const m = await this.prisma.movimientoFinanciero.findUnique({
        where: { id: Number(id) },
        select: {
          id: true,
          creadoEn: true,
          actualizadoEn: true,
          fecha: true,
          descripcion: true,
          referencia: true,
          conFactura: true,

          deltaCaja: true,
          deltaBanco: true,

          clasificacion: true,
          motivo: true,
          metodoPago: true,

          esDepositoCierre: true,
          esDepositoProveedor: true,

          gastoOperativoTipo: true,
          costoVentaTipo: true,
          afectaInventario: true,

          cuentaBancaria: {
            select: { id: true, banco: true, alias: true, numero: true },
          },

          proveedor: { select: { id: true, nombre: true } },
          usuario: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },

          comprobanteNumero: true,
          comprobanteFecha: true,
          comprobanteTipo: true,

          registroCaja: {
            select: {
              id: true,
              comentario: true,
              comentarioFinal: true,
              fechaApertura: true,
              fechaCierre: true,
              saldoInicial: true,
              saldoFinal: true,
              estado: true,
              depositado: true,
              creadoEn: true,
              actualizadoEn: true,
              sucursal: { select: { id: true, nombre: true } },
              usuarioInicio: {
                select: { id: true, nombre: true, correo: true },
              },
              usuarioCierre: {
                select: { id: true, nombre: true, correo: true },
              },
            },
          },
        },
      });

      if (!m) throw new NotFoundException(`Movimiento #${id} no encontrado`);

      const tipo = this.inferTipo(m);
      const categoria = this.inferCategoria(m);
      const monto = this.montoDesdeDeltas(m);
      const bancoNombre =
        m.cuentaBancaria?.banco ?? m.cuentaBancaria?.alias ?? null;

      // Caja (slim) mapeada a tu CajaSlimDetail
      const caja = m.registroCaja
        ? {
            id: m.registroCaja.id,
            comentario: m.registroCaja.comentario ?? null,
            comentarioFinal: m.registroCaja.comentarioFinal ?? null,
            fechaApertura: m.registroCaja.fechaApertura.toISOString(),
            fechaCierre: m.registroCaja.fechaCierre
              ? m.registroCaja.fechaCierre.toISOString()
              : null,
            saldoInicial: Number(m.registroCaja.saldoInicial),
            saldoFinal:
              m.registroCaja.saldoFinal == null
                ? 0
                : Number(m.registroCaja.saldoFinal),
            estado: m.registroCaja.estado as any, // "ABIERTO" | "CERRADO" | "ARQUEO" | ...
            depositado: m.registroCaja.depositado,
            creadoEn: m.registroCaja.creadoEn.toISOString(),
            actualizadoEn: m.registroCaja.actualizadoEn.toISOString(),
            sucursal: m.registroCaja.sucursal
              ? {
                  id: m.registroCaja.sucursal.id,
                  nombre: m.registroCaja.sucursal.nombre,
                }
              : null,
            usuarioInicio: m.registroCaja.usuarioInicio
              ? {
                  id: m.registroCaja.usuarioInicio.id,
                  nombre: m.registroCaja.usuarioInicio.nombre,
                  correo: m.registroCaja.usuarioInicio.correo,
                }
              : null,
            usuarioCierre: m.registroCaja.usuarioCierre
              ? {
                  id: m.registroCaja.usuarioCierre.id,
                  nombre: m.registroCaja.usuarioCierre.nombre,
                  correo: m.registroCaja.usuarioCierre.correo,
                }
              : null,
          }
        : null;

      // Respuesta final (compatible con tu MovimientoCajaDetail)
      const item = {
        // Legacy
        id: m.id,
        creadoEn: m.creadoEn.toISOString(),
        actualizadoEn: m.actualizadoEn.toISOString(),
        banco: bancoNombre,
        categoria,
        descripcion: m.descripcion ?? null,
        fecha: m.fecha.toISOString(),
        monto,
        numeroBoleta: this.maybeBoleta(m.referencia),
        referencia: m.referencia ?? null,
        tipo,
        usadoParaCierre: !!m.esDepositoCierre,

        usuario: m.usuario
          ? {
              id: m.usuario.id,
              nombre: m.usuario.nombre,
              rol: m.usuario.rol,
              correo: m.usuario.correo,
            }
          : null,
        proveedor: m.proveedor
          ? { id: m.proveedor.id, nombre: m.proveedor.nombre }
          : null,
        caja,

        // Extras opcionales (nuevo modelo)
        clasificacion: m.clasificacion,
        motivo: m.motivo,
        metodoPago: m.metodoPago ?? null,

        deltaCaja: this.num(m.deltaCaja),
        deltaBanco: this.num(m.deltaBanco),

        esDepositoCierre: m.esDepositoCierre,
        esDepositoProveedor: m.esDepositoProveedor,
        gastoOperativoTipo: m.gastoOperativoTipo ?? null,
        costoVentaTipo: m.costoVentaTipo ?? null,
        afectaInventario: m.afectaInventario,

        comprobanteTipo: m?.comprobanteTipo,
        comprobanteFecha: m?.comprobanteFecha,
        comprobanteNumero: m?.comprobanteNumero,

        cuentaBancaria: m.cuentaBancaria
          ? {
              id: m.cuentaBancaria.id,
              banco: m.cuentaBancaria.banco ?? null,
              alias: m.cuentaBancaria.alias ?? null,
              numeroMasked: this.maskNumero(m.cuentaBancaria.numero),
            }
          : null,
      };

      return item;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  /**
   * ELIMINARCION DE MOVIMIENTO
   * @param id
   * @returns
   */
  async remove(id: number) {
    try {
      if (!id) throw new BadRequestException('ID NO VÁLIDO');
      const record = await this.prisma.movimientoFinanciero.delete({
        where: {
          id,
        },
      });
      return record;
    } catch (error) {
      throw error;
    }
  }
}
