import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateCajaRegistroDto } from './dto/create-caja-registro.dto';
import { UpdateCajaRegistroDto } from './dto/update-caja-registro.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { TimeoutError } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PageOptionsDto } from 'src/utils/page-options';
import { CajaRegistrosQueryDto } from './dto/dto-caja-request';
import { parseDecimal } from 'src/utils/parseDecimal';

@Injectable()
export class CajaRegistrosService {
  private logger = new Logger(CajaRegistrosService.name);
  constructor(private readonly prisma: PrismaService) {}

  private num(n: any): number {
    return n == null ? 0 : Number(n);
  }
  private isZero(n: any): boolean {
    return Math.abs(this.num(n)) < 0.000001;
  }

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
    return null;
  }

  private montoDesdeDeltas(m: any): number {
    const dc = this.num(m.deltaCaja);
    const db = this.num(m.deltaBanco);
    if (!this.isZero(dc)) return Math.abs(dc);
    return Math.abs(db);
  }

  private maskNumero(num?: string | null): string | null {
    if (!num) return null;
    return `****${num.slice(-4)}`;
  }

  private maybeBoleta(ref?: string | null): string | null {
    if (!ref) return null;
    return /^[0-9]{4,}$/.test(ref) ? ref : null;
  }

  /**
   * @param id ID de caja
   * @returns La caja con todas sus props (compatible con tu FE)
   */
  async getRegistroCajaById(id: number) {
    try {
      const caja = await this.prisma.registroCaja.findUnique({
        where: { id },
        include: {
          sucursal: { select: { id: true, nombre: true } },
          usuarioInicio: { select: { id: true, nombre: true, correo: true } },
          usuarioCierre: { select: { id: true, nombre: true, correo: true } },
          // Movimientos financieros (nuevo modelo)
          movimientos: {
            orderBy: { creadoEn: 'desc' },
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
            },
          },
          // Ventas
          venta: {
            orderBy: { fechaVenta: 'desc' },
            select: {
              id: true,
              totalVenta: true,
              fechaVenta: true,
              tipoComprobante: true,
              referenciaPago: true,
              // soporta ambos modelos (string o relación)
              metodoPago: true as any,
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
                      codigoProducto: true,
                      nombre: true,
                      descripcion: true,
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

      if (!caja) throw new NotFoundException('Registro de caja no encontrado');

      // --- map movimientos (legacy + nuevos opcionales) ---
      const movimientosCaja = (caja.movimientos ?? []).map((m) => {
        const tipo = this.inferTipo(m);
        const categoria = this.inferCategoria(m);
        const monto = this.montoDesdeDeltas(m);

        const bancoNombre =
          m.cuentaBancaria?.banco ?? m.cuentaBancaria?.alias ?? null;

        return {
          // legacy
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

          // nuevos opcionales
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

      // --- map ventas (igual que lista; soporta metodoPago string o relación) ---
      const ventas = (caja.venta ?? []).map((v) => ({
        id: v.id,
        totalVenta: this.num(v.totalVenta),
        tipoComprobante: v.tipoComprobante ?? null,
        metodoPago:
          typeof (v as any).metodoPago === 'string'
            ? (v as any).metodoPago
            : ((v as any).metodoPago?.metodoPago ?? null),
        fechaVenta: v.fechaVenta.toISOString(),
        referenciaPago: v.referenciaPago ?? 'N/A',
        cliente: v.cliente
          ? { id: v.cliente.id, nombre: v.cliente.nombre }
          : 'CF',
        productos: v.productos.map((p, idx) => ({
          id: p.id,
          cantidad: p.cantidad,
          precioVenta: this.num(p.precioVenta),
          estado: p.estado,
          producto: {
            id: p.producto.id,
            nombre: p.producto.nombre,
            descripcion: p.producto.descripcion,
            codigoProducto: p.producto.codigoProducto,
            imagenesProducto: (p.producto.imagenesProducto ?? []).map(
              (img, i) => ({
                id: img.id ?? i,
                public_id: img.public_id,
                url: img.url,
              }),
            ),
          },
        })),
      }));

      // --- item final (compatible con RegistroCajaResponse) ---
      const item = {
        id: caja.id,
        creadoEn: caja.creadoEn.toISOString(),
        actualizadoEn: caja.actualizadoEn.toISOString(),
        comentarioInicial: caja.comentario ?? null,
        comentarioFinal: caja.comentarioFinal ?? null,
        depositado: caja.depositado,
        estado: caja.estado, // string

        estadoCuadre: caja.estadoCuadre, // string
        efectivoContado: parseDecimal(caja.efectivoContado), // string
        diferenciaCaja: parseDecimal(caja.diferenciaCaja), // string
        comentarioCuadre: caja.comentarioCuadre, // string

        fechaApertura: caja.fechaApertura.toISOString(),
        fechaCierre: caja.fechaCierre
          ? caja.fechaCierre.toISOString()
          : (null as any),
        movimientoCaja: null, // reservado (legacy)
        saldoInicial: this.num(caja.saldoInicial),
        saldoFinal: caja.saldoFinal == null ? 0 : this.num(caja.saldoFinal),
        ventasLenght: ventas.length,
        movimientosLenght: movimientosCaja.length,
        usuarioInicio: caja.usuarioInicio
          ? {
              id: caja.usuarioInicio.id,
              nombre: caja.usuarioInicio.nombre,
              correo: caja.usuarioInicio.correo,
            }
          : null,
        usuarioCierre: caja.usuarioCierre
          ? {
              id: caja.usuarioCierre.id,
              nombre: caja.usuarioCierre.nombre,
              correo: caja.usuarioCierre.correo,
            }
          : null,
        sucursal: { id: caja.sucursal.id, nombre: caja.sucursal.nombre },
        movimientosCaja,
        ventas,
      };

      return item;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error inesperado');
    }
  }
}
