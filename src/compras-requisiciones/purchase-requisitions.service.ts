import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto';
import { PrismaService } from 'src/prisma/prisma.service';

import { TZGT } from 'src/utils/utils';
import {
  CostoVentaTipo,
  EstadoProrrateo,
  MetodoPago,
  MetodoProrrateo,
  MotivoMovimiento,
  Prisma,
  TipoMovimientoStock,
} from '@prisma/client';
import { ComprasRegistrosQueryDto } from './dto/compras-registros.query.dto';
import {
  CreateRequisicionRecepcionDto,
  CreateRequisicionRecepcionLineaDto,
} from 'src/recepcion-requisiciones/dto/requisicion-recepcion-create.dto';
import { EntregaStockData } from 'src/utilities/utils';
import { UtilitiesService } from 'src/utilities/utilities.service';
import { HistorialStockTrackerService } from 'src/historial-stock-tracker/historial-stock-tracker.service';
import { RecepcionarCompraAutoDto } from './dto/compra-recepcion.dto';
import { StockBaseDto, StockPresentacionDto } from './interfaces';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';
import { ProrrateoService } from 'src/prorrateo/prorrateo.service';
import { PresupuestosService } from 'src/control-presupuestal/presupuestos/app/presupuestos.service';
import { dayjs } from 'src/utils/dayjs';

const N = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);

const MONEY_DECIMALS = 4; // totales
const round = (n: number, d: number) => Number(n.toFixed(d));

@Injectable()
export class PurchaseRequisitionsService {
  private readonly logger = new Logger(PurchaseRequisitionsService.name);
  constructor(
    private readonly prisma: PrismaService,

    private readonly utilities: UtilitiesService,
    private readonly mf: MovimientoFinancieroService,

    private readonly tracker: HistorialStockTrackerService,
    private readonly prorrateo: ProrrateoService,
    private readonly presupuestoService: PresupuestosService,
  ) {}

  create(createPurchaseRequisitionDto: CreatePurchaseRequisitionDto) {
    return 'This action adds a new purchaseRequisition';
  }

  /**
   *
   * @param q Queries para el filtrado
   * @returns
   */
  async getRegistrosCompras(q: ComprasRegistrosQueryDto) {
    try {
      const page = Number(q.page ?? 1) || 1;
      const limit = Math.max(1, Math.min(Number(q.limit ?? 10) || 10, 100));
      const skip = (page - 1) * limit;

      const {
        sucursalId,
        estado,
        proveedorId,
        conFactura,
        fechaInicio,
        fechaFin,
        creadoInicio,
        creadoFin,
        minTotal,
        maxTotal,
        search,
        orderBy = 'fecha',
        order = 'desc',
        groupByProveedor,
        withDetalles = true,
      } = q;

      // ---- WHERE para detalles
      // ▶ ahora también buscamos por presentacion.nombre / sku / codigoBarras
      const detalleWhere: Prisma.CompraDetalleWhereInput = search
        ? {
            OR: [
              // Producto
              {
                producto: { nombre: { contains: search, mode: 'insensitive' } },
              },
              {
                producto: {
                  codigoProducto: { contains: search, mode: 'insensitive' },
                },
              },
              // Presentación
              {
                presentacion: {
                  nombre: { contains: search, mode: 'insensitive' },
                },
              },
              // {
              //   presentacion: {
              //     sku: { contains: search, mode: 'insensitive' },
              //   },
              // },
              {
                presentacion: {
                  codigoBarras: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {};

      const hasDetalleSearch = !!search;

      // ---- WHERE principal
      const where: Prisma.CompraWhereInput = {
        ...(sucursalId ? { sucursalId: Number(sucursalId) } : {}),
        ...(estado ? { estado } : {}),
        ...(typeof proveedorId === 'number' ? { proveedorId } : {}),
        ...(typeof conFactura === 'boolean' ? { conFactura } : {}),
        ...(fechaInicio || fechaFin
          ? {
              fecha: {
                ...(fechaInicio ? { gte: new Date(fechaInicio) } : {}),
                ...(fechaFin ? { lte: new Date(fechaFin) } : {}),
              },
            }
          : {}),
        ...(creadoInicio || creadoFin
          ? {
              creadoEn: {
                ...(creadoInicio ? { gte: new Date(creadoInicio) } : {}),
                ...(creadoFin ? { lte: new Date(creadoFin) } : {}),
              },
            }
          : {}),
        ...(minTotal || maxTotal
          ? {
              total: {
                ...(typeof minTotal === 'number' ? { gte: minTotal } : {}),
                ...(typeof maxTotal === 'number' ? { lte: maxTotal } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { facturaNumero: { contains: search, mode: 'insensitive' } },
                {
                  proveedor: {
                    nombre: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  requisicion: {
                    folio: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  usuario: {
                    OR: [
                      { nombre: { contains: search, mode: 'insensitive' } },
                      { correo: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
                // Búsqueda en productos/presentaciones a través de detalles
                { detalles: { some: detalleWhere } },
              ],
            }
          : {}),
        ...(hasDetalleSearch ? { detalles: { some: detalleWhere } } : {}),
      };

      // ---- Orden
      const orderByObj: Prisma.CompraOrderByWithRelationInput =
        orderBy === 'total'
          ? { total: order }
          : orderBy === 'creadoEn'
            ? { creadoEn: order }
            : { fecha: order }; // default

      // ---- SELECT (withDetalles para aligerar)
      const baseSelect = {
        id: true,
        creadoEn: true,
        actualizadoEn: true,
        conFactura: true,
        estado: true,
        facturaFecha: true,
        facturaNumero: true,
        total: true,
        fecha: true,
        proveedor: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true, correo: true } },
        pedido: { select: { id: true, folio: true } },
        requisicion: {
          select: {
            id: true,
            folio: true,
            estado: true,
            fecha: true,
            totalLineas: true,
            usuario: { select: { id: true, nombre: true, correo: true } },
            createdAt: true,
            updatedAt: true,
          },
        },
      } as const;

      // ▶ detallesSelect ahora incluye presentacion
      const detallesSelect = {
        detalles: {
          orderBy: { cantidad: 'desc' },
          select: {
            id: true,
            creadoEn: true,
            actualizadoEn: true,
            cantidad: true,
            costoUnitario: true,
            producto: {
              select: {
                id: true,
                nombre: true,
                codigoProducto: true,
                precioCostoActual: true,
              },
            },
            presentacion: {
              select: {
                id: true,
                nombre: true,
                // sku: true,
                codigoBarras: true,
                tipoPresentacion: true,
                // factorUnidadBase: true, // Decimal
                costoReferencialPresentacion: true, // Decimal?
              },
            },
          },
        },
      } as const;

      // ---- Query
      const [total, compras] = await this.prisma.$transaction([
        this.prisma.compra.count({ where }),
        this.prisma.compra.findMany({
          where,
          take: limit,
          skip,
          orderBy: orderByObj,
          select: withDetalles
            ? { ...baseSelect, ...detallesSelect }
            : baseSelect,
        }),
      ]);

      // Helper: Decimal|number|null → number
      const toNum = (v: any, fallback = 0): number => {
        if (v == null) return fallback;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') return parseFloat(v);
        // Prisma.Decimal u otros
        return parseFloat(v.toString?.() ?? `${fallback}`);
      };

      // ---- Mapping seguro para UI (ahora con presentacion)
      const items = compras.map((c) => {
        const folioOrigen =
          (c as any).requisicion?.folio ?? (c as any).pedido?.folio ?? null;
        const tipoOrigen = (c as any).requisicion
          ? 'REQUISICION'
          : (c as any).pedido
            ? 'PEDIDO'
            : 'DIRECTA';

        const detalles = (
          withDetalles ? ((c as any).detalles ?? []) : []
        ) as Array<{
          id: number;
          creadoEn: Date | null;
          actualizadoEn: Date | null;
          cantidad: number | null;
          costoUnitario: number | null;
          producto?: {
            id?: number;
            nombre?: string;
            codigoProducto?: string;
            precioCostoActual?: number | null;
          } | null;
          presentacion?: {
            id: number;
            nombre: string | null;
            // sku: string | null;
            codigoBarras: string | null;
            tipoPresentacion: string | null;
            // factorUnidadBase: any; // Decimal
            costoReferencialPresentacion: any; // Decimal
          } | null;
        }>;

        const detallesUI = detalles.map((d) => {
          const costoUnitario = toNum(
            d.costoUnitario,
            toNum(d.producto?.precioCostoActual, 0),
          );
          const cantidad = d.cantidad ?? 0;

          // ▶ desbloqueamos datos de presentación para la UI
          const pres = d.presentacion
            ? {
                id: d.presentacion.id,
                nombre: d.presentacion.nombre ?? '',
                // sku: d.presentacion.sku ?? null,
                codigoBarras: d.presentacion.codigoBarras ?? null,
                tipoPresentacion: d.presentacion.tipoPresentacion ?? null,
                // factorUnidadBase: toNum(d.presentacion.factorUnidadBase, 1),
                costoReferencialPresentacion: toNum(
                  d.presentacion.costoReferencialPresentacion,
                  0,
                ),
              }
            : null;

          return {
            id: d.id,
            cantidad,
            costoUnitario,
            subtotal: cantidad * costoUnitario,
            creadoEn: (d.creadoEn as any)?.toISOString?.() ?? null,
            actualizadoEn: (d.actualizadoEn as any)?.toISOString?.() ?? null,
            producto: {
              id: d.producto?.id ?? null,
              nombre: d.producto?.nombre ?? '',
              codigo: d.producto?.codigoProducto ?? '',
              precioCostoActual: d.producto?.precioCostoActual ?? null,
            },
            presentacion: pres, // ▶ nuevo bloque en el detalle
          };
        });

        const resumen = detallesUI.reduce(
          (acc, it) => {
            acc.items += 1;
            acc.cantidadTotal += it.cantidad;
            acc.subtotal += it.subtotal;
            return acc;
          },
          { items: 0, cantidadTotal: 0, subtotal: 0 },
        );

        return {
          id: (c as any).id,
          estado: (c as any).estado ?? 'ESPERANDO_ENTREGA',
          total: (c as any).total ?? resumen.subtotal,
          fecha: ((c as any).fecha as any)?.toISOString?.() ?? null,

          folioOrigen,
          tipoOrigen,

          conFactura: !!(c as any).conFactura,
          proveedor: (c as any).proveedor
            ? {
                id: (c as any).proveedor.id,
                nombre: (c as any).proveedor.nombre,
              }
            : null,
          factura: (c as any).conFactura
            ? {
                numero: (c as any).facturaNumero ?? null,
                fecha:
                  ((c as any).facturaFecha as any)?.toISOString?.() ?? null,
              }
            : null,
          usuario: {
            id: (c as any).usuario?.id ?? null,
            nombre: (c as any).usuario?.nombre ?? '',
            correo: (c as any).usuario?.correo ?? '',
          },
          pedido: (c as any).pedido
            ? { id: (c as any).pedido.id, folio: (c as any).pedido.folio }
            : {},
          requisicion: (c as any).requisicion
            ? {
                id: (c as any).requisicion.id,
                folio: (c as any).requisicion.folio ?? (c as any).pedido?.folio,
                estado: (c as any).requisicion.estado ?? 'PENDIENTE',
                fecha:
                  ((c as any).requisicion.fecha as any)?.toISOString?.() ??
                  null,
                totalLineas: (c as any).requisicion.totalLineas ?? 0,
                usuario: {
                  id: (c as any).requisicion.usuario?.id ?? null,
                  nombre: (c as any).requisicion.usuario?.nombre ?? '',
                  correo: (c as any).requisicion.usuario?.correo ?? '',
                },
                createdAt:
                  ((c as any).requisicion.createdAt as any)?.toISOString?.() ??
                  null,
                updatedAt:
                  ((c as any).requisicion.updatedAt as any)?.toISOString?.() ??
                  null,
              }
            : null,
          creadoEn: ((c as any).creadoEn as any)?.toISOString?.() ?? null,
          actualizadoEn:
            ((c as any).actualizadoEn as any)?.toISOString?.() ?? null,

          detalles: detallesUI,
          resumen,
        };
      });

      if (groupByProveedor) {
        const agrupado = items.reduce<
          Record<
            string,
            {
              proveedor: { id: number | null; nombre: string };
              registros: typeof items;
            }
          >
        >((acc, it) => {
          const key = String(it.proveedor?.id ?? 'SIN_PROVEEDOR');
          if (!acc[key]) {
            acc[key] = {
              proveedor: {
                id: it.proveedor?.id ?? null,
                nombre: it.proveedor?.nombre ?? '—',
              },
              registros: [] as any,
            };
          }
          acc[key].registros.push(it);
          return acc;
        }, {});

        return {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          itemsByProveedor: Object.values(agrupado),
        };
      }

      return {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        items,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado en listado de compras',
      );
    }
  }

  /**
   *
   * @param compraID ID de compra unitaria
   * @returns
   */
  async getRegistroCompra(compraID: number) {
    try {
      if (!compraID || Number.isNaN(compraID)) {
        throw new BadRequestException('ID de compra inválido');
      }

      const c = await this.prisma.compra.findUnique({
        where: { id: compraID },
        include: {
          proveedor: { select: { id: true, nombre: true } },
          sucursal: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true, correo: true } },
          requisicion: {
            select: {
              id: true,
              folio: true,
              estado: true,
              fecha: true,
              totalLineas: true,
              createdAt: true,
              updatedAt: true,
              usuario: { select: { id: true, nombre: true, correo: true } },
            },
          },
          pedido: {
            select: {
              id: true,
              folio: true,
              fecha: true,
              estado: true,
              prioridad: true,
              tipo: true,
              observaciones: true,
              usuario: { select: { id: true, nombre: true, correo: true } },
              cliente: { select: { id: true, nombre: true } },
            },
          },
          // ▶ DETALLES con PRESENTACIÓN
          detalles: {
            orderBy: { cantidad: 'desc' },
            select: {
              id: true,
              creadoEn: true,
              actualizadoEn: true,
              cantidad: true,
              costoUnitario: true,
              fechaVencimiento: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  codigoProducto: true,
                  precioCostoActual: true,
                },
              },
              presentacion: {
                select: {
                  id: true,
                  nombre: true,
                  // sku: true,
                  codigoBarras: true,
                  tipoPresentacion: true,
                  // factorUnidadBase: true, // Decimal
                  costoReferencialPresentacion: true, // Decimal?
                },
              },
            },
          },
        },
      });

      if (!c) throw new NotFoundException('Compra no encontrada');

      // Helper: Decimal|string|number|null → number
      const toNum = (v: any, fallback = 0): number => {
        if (v == null) return fallback;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') return parseFloat(v);
        return parseFloat(v?.toString?.() ?? `${fallback}`);
      };

      // ---- map null-safe a formato UI (con presentacion)
      const detalles = (c.detalles ?? []).map((d) => {
        const costoUnitario = toNum(
          d.costoUnitario,
          toNum(d.producto?.precioCostoActual, 0),
        );
        const cantidad = d.cantidad ?? 0;

        const presentacion = d.presentacion
          ? {
              id: d.presentacion.id,
              nombre: d.presentacion.nombre ?? '',
              // sku: d.presentacion.sku ?? null,
              codigoBarras: d.presentacion.codigoBarras ?? null,
              tipoPresentacion: d.presentacion.tipoPresentacion ?? null,
              // factorUnidadBase: toNum(d.presentacion.factorUnidadBase, 1),
              costoReferencialPresentacion: toNum(
                d.presentacion.costoReferencialPresentacion,
                0,
              ),
            }
          : null;

        return {
          id: d.id,
          cantidad,
          costoUnitario, // costo por PRESENTACIÓN
          subtotal: cantidad * costoUnitario,
          creadoEn: (d.creadoEn as any)?.toISOString?.() ?? null,
          actualizadoEn: (d.actualizadoEn as any)?.toISOString?.() ?? null,
          fechaVencimiento: d.fechaVencimiento,
          producto: {
            id: d.producto?.id ?? null,
            nombre: d.producto?.nombre ?? '',
            codigo: d.producto?.codigoProducto ?? '',
            precioCostoActual: d.producto?.precioCostoActual ?? null,
          },
          presentacion, // ▶ nuevo bloque
        };
      });

      const resumen = detalles.reduce(
        (acc, it) => {
          acc.items += 1;
          acc.cantidadTotal += it.cantidad;
          acc.subtotal += it.subtotal;
          return acc;
        },
        { items: 0, cantidadTotal: 0, subtotal: 0 },
      );

      const resp = {
        id: c.id,
        estado: c.estado ?? 'ESPERANDO_ENTREGA',
        fecha: (c.fecha as any)?.toISOString?.() ?? null,
        total: c.total ?? resumen.subtotal,
        conFactura: !!c.conFactura,

        factura: c.conFactura
          ? {
              numero: c.facturaNumero ?? null,
              fecha: (c.facturaFecha as any)?.toISOString?.() ?? null,
            }
          : null,

        origen: c.origen, // DB
        folioOrigen: c.requisicion?.folio ?? c.pedido?.folio ?? null,

        proveedor: c.proveedor
          ? { id: c.proveedor.id, nombre: c.proveedor.nombre }
          : null,
        sucursal: c.sucursal
          ? { id: c.sucursal.id, nombre: c.sucursal.nombre }
          : null,
        usuario: {
          id: c.usuario?.id ?? null,
          nombre: c.usuario?.nombre ?? '',
          correo: c.usuario?.correo ?? '',
        },

        requisicion: c.requisicion
          ? {
              id: c.requisicion.id,
              folio: c.requisicion.folio ?? '',
              estado: c.requisicion.estado ?? 'PENDIENTE',
              fecha: (c.requisicion.fecha as any)?.toISOString?.() ?? null,
              totalLineas: c.requisicion.totalLineas ?? 0,
              createdAt:
                (c.requisicion.createdAt as any)?.toISOString?.() ?? null,
              updatedAt:
                (c.requisicion.updatedAt as any)?.toISOString?.() ?? null,
              usuario: {
                id: c.requisicion.usuario?.id ?? null,
                nombre: c.requisicion.usuario?.nombre ?? '',
                correo: c.requisicion.usuario?.correo ?? '',
              },
            }
          : null,

        pedido:
          !c.requisicion && c.pedido
            ? {
                id: c.pedido.id,
                folio: c.pedido.folio,
                estado: c.pedido.estado,
                fecha: (c.pedido.fecha as any)?.toISOString?.() ?? null,
                prioridad: c.pedido.prioridad,
                tipo: c.pedido.tipo,
                observaciones: c.pedido.observaciones ?? '',
                usuario: {
                  id: c.pedido.usuario?.id ?? null,
                  nombre: c.pedido.usuario?.nombre ?? '',
                  correo: c.pedido.usuario?.correo ?? '',
                },
                cliente: c.pedido.cliente
                  ? { id: c.pedido.cliente.id, nombre: c.pedido.cliente.nombre }
                  : null,
              }
            : null,

        creadoEn: (c.creadoEn as any)?.toISOString?.() ?? null,
        actualizadoEn: (c.actualizadoEn as any)?.toISOString?.() ?? null,
        detalles,
        resumen,
      };

      return resp;
    } catch (error) {
      this.logger.error('El error es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  /**
   *
   * @param dto
   * @returns
   */
  async makeRecepcionRequisicion(dto: CreateRequisicionRecepcionDto) {
    try {
      const requisicionId = await this.prisma.compra.findUnique({
        where: {
          id: dto.compraId,
        },
        select: {
          requisicionId: true,
        },
      });

      return await this.prisma.$transaction(async (tx) => {
        const requisicionMain = await tx.requisicion.findUnique({
          where: { id: dto.requisicionId },
        });

        if (!requisicionMain) {
          throw new NotFoundException({
            message: 'Error al encontrar el registro de requisición',
          });
        }

        const newRequisicionRecepcion = await tx.requisicionRecepcion.create({
          data: {
            observaciones: dto.observaciones,
            usuario: { connect: { id: dto.usuarioId } },
            requisicion: { connect: { id: dto.requisicionId } },
          },
        });

        const lineas = await Promise.all(
          dto.lineas.map((prod) =>
            tx.requisicionRecepcionLinea.create({
              data: {
                requisicionRecepcion: {
                  connect: { id: newRequisicionRecepcion.id },
                },
                requisicionLinea: { connect: { id: prod.requisicionLineaId } },
                producto: { connect: { id: prod.productoId } },
                cantidadSolicitada: prod.cantidadSolicitada,
                cantidadRecibida: prod.cantidadRecibida,
                ingresadaAStock: prod.ingresadaAStock ?? true,
              },
            }),
          ),
        );

        await Promise.all(
          dto.lineas.map((prod) =>
            tx.requisicionLinea.update({
              where: { id: prod.requisicionLineaId },
              data: {
                cantidadRecibida: prod.cantidadRecibida,
                ingresadaAStock: true,
              },
            }),
          ),
        );

        const stockDtos = dto.lineas.map((linea) => ({
          productoId: linea.productoId,
          cantidad: linea.cantidadRecibida,
          costoTotal: (linea.precioUnitario ?? 0) * linea.cantidadRecibida,
          fechaIngreso: new Date().toISOString(),
          fechaExpiracion: linea?.fechaExpiracion ?? null,
          precioCosto: linea.precioUnitario ?? 0,
          sucursalId: requisicionMain.sucursalId,
          requisicionRecepcionId: newRequisicionRecepcion.id,
        }));

        const totalEntrega = dto.lineas.reduce(
          (accumulador: number, linea: CreateRequisicionRecepcionLineaDto) =>
            accumulador + (linea.precioUnitario ?? 0) * linea.cantidadRecibida,
          0,
        );

        let entregaStockData: EntregaStockData = {
          fechaEntrega: dayjs().tz('America/Guatemala').toDate(),
          montoTotal: totalEntrega,
          proveedorId: dto.proveedorId,
          sucursalId: dto.sucursalId,
          recibidoPorId: dto.usuarioId,
        };

        await this.tracker.trackIngresoProductos(
          tx,
          dto.lineas,
          dto.sucursalId,
          dto.usuarioId,
          dto.requisicionId,
          TipoMovimientoStock.INGRESO_REQUISICION,
          'Este comentario surge dentro de la funcion main',
        );

        const newStocks = await this.utilities.generateStockFromRequisicion(
          tx,
          stockDtos,
          entregaStockData,
        );

        if (newStocks && lineas) {
          await tx.requisicion.update({
            where: {
              id: requisicionMain.id,
            },
            data: {
              fechaRecepcion: dayjs().tz('America/Guatemala').toDate(),
              ingresadaAStock: true,
              estado: 'RECIBIDA',
            },
          });
        }

        return { newRequisicionRecepcion, lineas, newStocks };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('El error es: ', error);
      throw new InternalServerErrorException({
        message: 'Fatal error: Error inesperado',
      });
    }
  }

  //=========================================================
  //                    RECEPCION TOTAL CASO 1
  //=========================================================
  async makeRecepcionCompraAuto(dto: RecepcionarCompraAutoDto) {
    try {
      this.logger.log(
        `DTO recibido para recepcionar una compra total es:\n${JSON.stringify(dto, null, 2)}`,
      );

      return await this.prisma.$transaction(async (tx) => {
        // 0) Compra + detalles + presentaciones
        const compra = await tx.compra.findUnique({
          where: { id: dto.compraId },
          include: {
            detalles: {
              select: {
                id: true,
                cantidad: true,
                costoUnitario: true,
                productoId: true,
                requisicionLineaId: true,
                presentacionId: true,
                presentacion: { select: { id: true } },
                fechaVencimiento: true,
              },
            },
            proveedor: { select: { id: true } },
            requisicion: {
              select: {
                id: true,
                presupuestoId: true,
              },
            },
            pedido: {
              select: {
                id: true,
                lineas: {
                  select: {
                    id: true,
                    productoId: true,
                    presentacionId: true,
                    cantidad: true,
                    precioUnitario: true,
                  },
                },
              },
            },
            sucursal: { select: { id: true } },
          },
        });

        // Mapa de fecha de expiración desde requisición (fallback)
        let reqFechasMap = new Map<number, Date>();
        if (compra?.requisicionId) {
          const rlIds = compra.detalles
            .map((d) => d.requisicionLineaId)
            .filter((x): x is number => Number.isFinite(x as any));
          if (rlIds.length) {
            const rl = await tx.requisicionLinea.findMany({
              where: { id: { in: rlIds } },
              select: { id: true, fechaExpiracion: true },
            });
            rl.forEach(
              (r) =>
                r.fechaExpiracion && reqFechasMap.set(r.id, r.fechaExpiracion),
            );
          }
        }

        // Overrides desde body (editar antes de recepcionar)
        const overrides = new Map<
          number,
          { fecha?: Date | null; lote?: string | null }
        >();
        for (const l of dto.lineas ?? []) {
          overrides.set(l.compraDetalleId, {
            fecha: l.fechaVencimiento
              ? dayjs.tz(l.fechaVencimiento, TZGT).toDate()
              : null,
            lote: l.loteCodigo ?? null,
          });
        }

        this.logger.log('El registro de compra a recepcionar es: ', compra);
        if (!compra) throw new NotFoundException('Compra no encontrada');
        const sucursalId = compra.sucursalId;
        if (!sucursalId)
          throw new BadRequestException(
            'La compra no tiene sucursal asociada.',
          );

        // 1) Si hay requisición, crear cabecera de recepción
        let requisicionRecepcionId: number | null = null;
        if (compra.requisicionId) {
          const req = await tx.requisicion.findUnique({
            where: { id: compra.requisicionId },
          });
          if (!req)
            throw new NotFoundException(
              'Requisición origen no encontrada para la compra',
            );
          const recep = await tx.requisicionRecepcion.create({
            data: {
              observaciones: dto.observaciones ?? null,
              usuario: { connect: { id: dto.usuarioId } },
              requisicion: { connect: { id: req.id } },
              fechaRecepcion: dayjs().tz(TZGT).toDate(),
            },
          });
          requisicionRecepcionId = recep.id;
        }

        // 2) Preparación
        const nowISO = dayjs().tz(TZGT).toISOString();
        const stockBaseDtos: StockBaseDto[] = [];
        const stockPresentacionDtos: StockPresentacionDto[] = [];
        const lineasRecep: Array<{
          compraDetalleId: number;
          productoId: number;
          cantidadSolicitada: number;
          cantidadRecibida: number;
          precioUnitario: number;
          cantidadRecibidaBase: number;
        }> = [];
        let solicitadoTotalUI = 0;
        let recibidoTotalUI = 0;
        let totalCompra = 0;

        const resolvePresentacionId = async (det: {
          id: number;
          presentacionId: number | null;
          productoId: number;
          requisicionLineaId: number | null;
          cantidad: number;
          costoUnitario: number;
        }): Promise<number | null> => {
          if (det.presentacionId) return det.presentacionId;
          if (det.requisicionLineaId) {
            const rl = await tx.requisicionLinea.findUnique({
              where: { id: det.requisicionLineaId },
              select: { presentacionId: true },
            });
            if (rl?.presentacionId) return rl.presentacionId;
          }
          if (compra.pedido?.lineas?.length) {
            const matches = compra.pedido.lineas.filter(
              (pl) =>
                pl.productoId === det.productoId &&
                pl.presentacionId != null &&
                Number(pl.cantidad) === Number(det.cantidad) &&
                Number(pl.precioUnitario) === Number(det.costoUnitario),
            );
            if (matches.length === 1) return matches[0].presentacionId!;
          }
          return null;
        };

        // ===== 3) Procesar cada detalle
        for (const det of compra.detalles) {
          const cantidadLinea = Number(det.cantidad ?? 0);
          const costoUnit = Number(det.costoUnitario ?? 0);

          solicitadoTotalUI += cantidadLinea;
          recibidoTotalUI += cantidadLinea;
          totalCompra += Number((cantidadLinea * costoUnit).toFixed(4));

          const presId = await resolvePresentacionId({
            id: det.id,
            presentacionId: det.presentacionId ?? null,
            productoId: det.productoId!,
            requisicionLineaId: det.requisicionLineaId ?? null,
            cantidad: cantidadLinea,
            costoUnitario: costoUnit,
          });

          const ov = overrides.get(det.id);
          const requestedFromCompra = det.fechaVencimiento ?? null;
          const fromReq = det.requisicionLineaId
            ? (reqFechasMap.get(det.requisicionLineaId) ?? null)
            : null;
          const resolvedVto: Date | null =
            ov?.fecha ?? requestedFromCompra ?? fromReq ?? null;

          this.logger.debug(
            `[RECEP] det#${det.id} p#${det.productoId} pres#${presId ?? '—'} ` +
              `cant:${cantidadLinea} costo:${costoUnit} ==> ` +
              (presId ? 'PRESENTACION(resuelta)' : 'BASE'),
          );

          // a) Vinculación con requisición
          if (det.requisicionLineaId && requisicionRecepcionId) {
            const reqLinea = await tx.requisicionLinea.findUnique({
              where: { id: det.requisicionLineaId },
              select: { cantidadRecibida: true },
            });

            await tx.requisicionRecepcionLinea.create({
              data: {
                requisicionRecepcion: {
                  connect: { id: requisicionRecepcionId },
                },
                requisicionLinea: { connect: { id: det.requisicionLineaId } },
                producto: { connect: { id: det.productoId! } },
                cantidadSolicitada: cantidadLinea,
                cantidadRecibida: cantidadLinea,
                ingresadaAStock: true,
              },
            });

            await tx.requisicionLinea.update({
              where: { id: det.requisicionLineaId },
              data: {
                cantidadRecibida:
                  (reqLinea?.cantidadRecibida ?? 0) + cantidadLinea,
                ingresadaAStock: true,
              },
            });
          }

          // b) SOLO PRODUCTO MAIN → Stock base
          if (!presId) {
            stockBaseDtos.push({
              productoId: det.productoId!,
              cantidad: cantidadLinea,
              costoTotal: Number((costoUnit * cantidadLinea).toFixed(4)),
              fechaIngreso: nowISO,
              fechaExpiracion: resolvedVto,
              precioCosto: costoUnit,
              sucursalId,
              requisicionRecepcionId: requisicionRecepcionId ?? undefined,
            });
          }

          // c) SOLO PRESENTACION → StockPresentacion
          if (presId) {
            const costoUnitPres = costoUnit;
            const costoTotalPres = round(
              costoUnitPres * cantidadLinea,
              MONEY_DECIMALS,
            );
            stockPresentacionDtos.push({
              productoId: det.productoId!,
              presentacionId: presId,
              sucursalId,
              cantidadPresentacion: cantidadLinea,
              fechaIngreso: dayjs().tz(TZGT).toDate(),
              fechaVencimiento: resolvedVto,
              requisicionRecepcionId,
              precioCosto: costoUnitPres,
              costoTotal: costoTotalPres,
            });
          }

          // d) Para respuesta/UI
          lineasRecep.push({
            compraDetalleId: det.id,
            productoId: det.productoId!,
            cantidadSolicitada: cantidadLinea,
            cantidadRecibida: cantidadLinea,
            precioUnitario: costoUnit,
            cantidadRecibidaBase: presId ? 0 : cantidadLinea,
          });
        }

        this.logger.debug(
          `[RECEP] Resumen a insertar: base=${stockBaseDtos.length}, pres=${stockPresentacionDtos.length}`,
        );
        this.logger.debug(
          `[RECEP] Base -> ` +
            JSON.stringify(
              stockBaseDtos.map((s) => ({
                p: s.productoId,
                cant: s.cantidad,
                costo: s.precioCosto,
              })),
              null,
              2,
            ),
        );
        this.logger.debug(
          `[RECEP] Pres -> ` +
            JSON.stringify(
              stockPresentacionDtos.map((s) => ({
                p: s.productoId,
                pres: s.presentacionId,
                cant: s.cantidadPresentacion,
              })),
              null,
              2,
            ),
        );

        // ===== 4) Entrega (única)
        let entregaId: number | null = null;
        if (stockBaseDtos.length > 0) {
          const result = await this.utilities.generateStockFromRequisicion(
            tx,
            stockBaseDtos,
            {
              fechaEntrega: dayjs().tz(TZGT).toDate(),
              montoTotal: Number(totalCompra.toFixed(4)),
              proveedorId: dto.proveedorId ?? null,
              sucursalId,
              recibidoPorId: dto.usuarioId,
            },
          );
          entregaId = (result as any)?.entregaStock?.id ?? null;
        } else {
          const entrega = await tx.entregaStock.create({
            data: {
              proveedor: dto.proveedorId
                ? { connect: { id: dto.proveedorId } }
                : undefined,
              montoTotal: Number(totalCompra.toFixed(4)),
              fechaEntrega: dayjs().tz(TZGT).toDate(),
              usuarioRecibido: { connect: { id: dto.usuarioId } },
              sucursal: { connect: { id: sucursalId } },
            },
          });
          entregaId = entrega.id;
        }

        // ===== 5) Insertar presentaciones
        let createdPresResult: {
          created: Array<{
            id: number;
            productoId: number;
            presentacionId: number;
            cantidadPresentacion: number;
            precioCosto: number;
            costoTotal: number;
          }>;
          totalCosto: number;
          totalCantidad: number;
        } = { created: [], totalCosto: 0, totalCantidad: 0 };

        if (stockPresentacionDtos.length > 0) {
          createdPresResult = await this.utilities.generateStockPresentacion(
            tx,
            stockPresentacionDtos,
          );
          this.logger.debug(
            `[RECEP] Presentaciones insertadas: ${createdPresResult.created.length} (totalCantidad=${createdPresResult.totalCantidad}, totalCosto=${createdPresResult.totalCosto.toFixed(2)})`,
          );
        }

        // ===== 6) Tracking (base)
        if (entregaId && stockBaseDtos.length > 0) {
          const baseAcumulado: Record<number, number> = {};
          for (const d of stockBaseDtos) {
            baseAcumulado[d.productoId] =
              (baseAcumulado[d.productoId] ?? 0) + d.cantidad;
          }
          const productIds = Object.keys(baseAcumulado).map(Number);

          const anteriores: Record<number, number> = {};
          await Promise.all(
            productIds.map(async (pid) => {
              const agg = await tx.stock.aggregate({
                where: { productoId: pid, sucursalId },
                _sum: { cantidad: true },
              });
              anteriores[pid] = agg._sum.cantidad ?? 0;
            }),
          );

          const trackers = productIds.map((pid) => ({
            productoId: pid,
            cantidadVendida: baseAcumulado[pid],
            cantidadAnterior: anteriores[pid] ?? 0,
          }));

          await this.tracker.trackeEntregaStock(
            tx,
            trackers,
            sucursalId,
            dto.usuarioId,
            entregaId,
            'ENTREGA_STOCK',
            `Recepción automática desde COMPRA`,
          );
        }

        // Historial presentaciones (opcional)
        if (stockPresentacionDtos.length > 0) {
          await Promise.all(
            stockPresentacionDtos.map((sp) =>
              tx.historialStock.create({
                data: {
                  tipo: 'ENTREGA_STOCK',
                  fechaCambio: dayjs().tz(TZGT).toDate(),
                  sucursalId,
                  usuarioId: dto.usuarioId,
                  productoId: sp.productoId,
                  presentacionId: sp.presentacionId,
                  comentario: 'Recepción de compra (presentación)',
                },
              }),
            ),
          );
        }

        // ===== 7) Estados
        const estadoCompra =
          recibidoTotalUI >= solicitadoTotalUI
            ? 'RECIBIDO'
            : 'RECIBIDO_PARCIAL';

        await tx.compra.update({
          where: { id: compra.id },
          data: {
            total: Number(totalCompra.toFixed(4)),
            estado: estadoCompra,
            ingresadaAStock: true,
            cantidadRecibidaAcumulada:
              (compra.cantidadRecibidaAcumulada ?? 0) + recibidoTotalUI,
          },
        });

        if (compra.pedido?.id) {
          await tx.pedido.update({
            where: { id: compra.pedido.id },
            data: { estado: 'RECIBIDO' },
          });
        }

        if (compra.requisicionId) {
          const req = await tx.requisicion.findUnique({
            where: { id: compra.requisicionId },
            include: { lineas: true },
          });
          if (req) {
            const todasRecibidas = req.lineas.every(
              (ln) => (ln.cantidadRecibida ?? 0) >= ln.cantidadSugerida,
            );
            await tx.requisicion.update({
              where: { id: req.id },
              data: {
                fechaRecepcion: dayjs().tz(TZGT).toDate(),
                ingresadaAStock: true,
                estado: todasRecibidas ? 'COMPLETADA' : 'RECIBIDA',
              },
            });
          }
        }

        // ===== 8) Movimientos financieros
        const metodo = dto.metodoPago ?? 'EFECTIVO';
        const canal = this.paymentChannel(metodo);
        let registroCajaId: number | undefined;
        let cuentaBancariaIdLocal: number | undefined;

        if (canal === 'CAJA') {
          registroCajaId =
            dto.registroCajaId ??
            (
              await tx.registroCaja.findFirst({
                where: { sucursalId, estado: 'ABIERTO' },
                select: { id: true },
              })
            )?.id;
          if (!registroCajaId)
            throw new BadRequestException('No hay turno de caja ABIERTO.');
          if (dto.cuentaBancariaId)
            throw new BadRequestException(
              'No especifiques cuenta bancaria para EFECTIVO.',
            );
        }

        if (canal === 'BANCO') {
          if (!dto.cuentaBancariaId)
            throw new BadRequestException(
              'Selecciona la cuenta bancaria para pagos por banco.',
            );
          cuentaBancariaIdLocal = dto.cuentaBancariaId;
          if (dto.registroCajaId)
            throw new BadRequestException(
              'No especifiques registro de caja para BANCO.',
            );
        }

        const montoRecepcion = Number(totalCompra.toFixed(4));
        const { deltaCaja, deltaBanco } = this.computeDeltas(
          metodo,
          montoRecepcion,
        );

        // --- Costo asociado (OPCIONAL) ---
        let MFCostosVentas: { id: number } | null = null;
        const mfPayload = dto.mf;
        const hasMF = !!mfPayload && Number(mfPayload.monto) > 0;

        if (hasMF) {
          const metodoMF = mfPayload.metodoPago ?? 'EFECTIVO';
          const canalMF = this.paymentChannel(metodoMF);

          const cuentaBancariaIdMF =
            mfPayload.cuentaBancariaId ?? dto.cuentaBancariaId;
          const registroCajaIdMF =
            mfPayload.registroCajaId ?? dto.registroCajaId;

          if (
            canalMF === 'BANCO' &&
            !Number.isFinite(Number(cuentaBancariaIdMF))
          ) {
            throw new BadRequestException(
              'Cuenta bancaria requerida para movimientos bancarios (costo asociado).',
            );
          }
          if (
            canalMF === 'CAJA' &&
            !Number.isFinite(Number(registroCajaIdMF))
          ) {
            const turno = await tx.registroCaja.findFirst({
              where: { sucursalId, estado: 'ABIERTO' },
              select: { id: true },
            });
            if (!turno) {
              throw new BadRequestException(
                'No hay turno de caja ABIERTO para costo asociado.',
              );
            }
          }

          MFCostosVentas = await this.mf.createMovimiento({
            usuarioId: dto.usuarioId,
            proveedorId: dto.proveedorId ?? undefined,
            monto: mfPayload.monto!,
            motivo: 'COSTO_ASOCIADO',
            metodoPago: metodoMF,
            descripcion: mfPayload.descripcion,
            sucursalId: mfPayload.sucursalId ?? sucursalId,
            costoVentaTipo: mfPayload.costoVentaTipo,
            clasificacionAdmin: 'COSTO_VENTA',
            cuentaBancariaId: Number.isFinite(Number(cuentaBancariaIdMF))
              ? Number(cuentaBancariaIdMF)
              : undefined,
            registroCajaId: Number.isFinite(Number(registroCajaIdMF))
              ? Number(registroCajaIdMF)
              : undefined,
          });
        } // si no hay MF, seguimos sin error

        // Movimiento financiero de la compra (siempre)
        await tx.movimientoFinanciero.create({
          data: {
            fecha: dayjs().tz(TZGT).toDate(),
            sucursalId,
            clasificacion: 'COSTO_VENTA',
            motivo: 'COMPRA_MERCADERIA',
            metodoPago: metodo,
            deltaCaja,
            deltaBanco,
            afectaInventario: true,
            costoVentaTipo: 'MERCADERIA',
            referencia: `COMPRA#${compra.id}`,
            descripcion: `Compra #${compra.id} - recepción a stock`,
            cuentaBancariaId: cuentaBancariaIdLocal,
            registroCajaId,
            proveedorId: compra.proveedor?.id ?? null,
            usuarioId: dto.usuarioId,
            conFactura: (compra as any).conFactura ?? undefined,
          },
        });

        this.logger.log(
          'El costo asociado de la compra (si hubo): ',
          MFCostosVentas,
        );

        // ===== 9) PRORRATEO (opcional)
        {
          const aplicarProrrateo: boolean = dto.aplicarProrrateo ?? hasMF;
          const costoAdicionalTotal: number = Number(
            (dto as any).costoAdicionalTotal ?? mfPayload?.monto ?? 0,
          );

          if (aplicarProrrateo && costoAdicionalTotal > 0) {
            // Identificar lotes NUEVOS creados en esta recepción
            const newBase = entregaId
              ? await tx.stock.findMany({
                  where: {
                    sucursalId,
                    entregaStockId: entregaId,
                    requisicionRecepcionId: requisicionRecepcionId ?? undefined,
                  },
                  select: { id: true },
                })
              : [];
            const newStockIds = newBase.map((x) => x.id);

            const newStockPresIds = (createdPresResult.created ?? []).map(
              (x) => x.id,
            );

            if (!newStockIds.length && !newStockPresIds.length) {
              this.logger.debug(
                '[PRORRATEO] No hay lotes nuevos para prorratear.',
              );
            } else {
              await this.prorrateo.generarProrrateoUnidadesTx(tx, {
                sucursalId,
                gastosAsociadosCompra: costoAdicionalTotal,
                movimientoFinancieroId: MFCostosVentas?.id ?? undefined,
                comentario: `Prorrateo UNIDADES – Compra #${compra.id} – Entrega #${entregaId}`,
                newStockIds,
                newStocksPresIds: newStockPresIds,
                compraId: compra.id,
                entregaStockId: entregaId,
              });
            }
          } else {
            this.logger.debug(
              `[PRORRATEO] Omitido: aplicarProrrateo=${aplicarProrrateo} costoAdicionalTotal=${costoAdicionalTotal}`,
            );
          }
        }

        if (compra.requisicion.presupuestoId) {
          await this.presupuestoService.ejercerSaldo(
            compra.requisicion.presupuestoId,
            totalCompra,
            compra.id,
            dto.usuarioId,
            tx,
          );
        }

        return {
          ok: true,
          compra: {
            id: compra.id,
            estado: estadoCompra,
            total: Number(totalCompra.toFixed(4)),
          },
          recepcion: requisicionRecepcionId
            ? { id: requisicionRecepcionId }
            : null,
          lineas: lineasRecep,
          stockBase: stockBaseDtos.length > 0 ? 'CREATED_BY_HELPER' : [],
          stockPresentacionCount: stockPresentacionDtos.length,
        };
      });
    } catch (e) {
      this.logger.error('El error generado es: ', e);
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  /**
   * Distribuye un monto usando "largest remainder":
   *  - Calcula asignación cruda = monto * peso
   *  - Redondea a MONEY_DECIMALS
   *  - Ajusta residuo en los items con mayor parte fraccional para cerrar sumatoria
   */
  distribute(amount: number, weights: number[]): number[] {
    const totalW = weights.reduce((a, b) => a + b, 0);
    if (totalW <= 0) return weights.map(() => 0);

    const raw = weights.map((w) => amount * (w / totalW));
    const rounded = raw.map((x) => round(x, MONEY_DECIMALS));
    const diff = round(
      amount - rounded.reduce((a, b) => a + b, 0),
      MONEY_DECIMALS,
    );

    if (diff === 0) return rounded;

    // distribuir el residuo por mayor fracción (positiva o negativa)
    const fracs = raw.map((x, i) => ({ i, frac: x - rounded[i] }));
    fracs.sort((a, b) => Math.abs(b.frac) - Math.abs(a.frac));

    let remaining = diff;
    const step =
      diff > 0
        ? +Math.pow(10, -MONEY_DECIMALS)
        : -Math.pow(10, -MONEY_DECIMALS);
    for (const f of fracs) {
      if (remaining === 0) break;
      rounded[f.i] = round(rounded[f.i] + step, MONEY_DECIMALS);
      remaining = round(remaining - step, MONEY_DECIMALS);
    }
    return rounded;
  }

  //OTROS--------------->
  paymentChannel(
    m: MetodoPago | null | undefined,
  ): 'CAJA' | 'BANCO' | 'NINGUNO' {
    switch (m) {
      case 'EFECTIVO':
      case 'CONTADO':
        return 'CAJA';
      case 'TRANSFERENCIA':
      case 'TARJETA':
      case 'CHEQUE':
        return 'BANCO';
      case 'CREDITO':
      default:
        return 'NINGUNO';
    }
  }

  computeDeltas(m: MetodoPago | null | undefined, monto: number) {
    const x = Math.abs(Number(monto) || 0);
    switch (m) {
      case 'EFECTIVO':
      case 'CONTADO':
        return { deltaCaja: -x, deltaBanco: 0 };
      case 'TRANSFERENCIA':
      case 'TARJETA':
      case 'CHEQUE':
        return { deltaCaja: 0, deltaBanco: -x };
      case 'CREDITO':
      default:
        return { deltaCaja: 0, deltaBanco: 0 };
    }
  }

  async getComprasDetallesFull() {
    try {
      return await this.prisma.compra.findMany({
        take: 2,
        orderBy: {
          creadoEn: 'desc',
        },
        select: {
          detalles: {
            select: {
              id: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  codigoProducto: true,
                },
              },
              presentacion: {
                select: {
                  id: true,
                  nombre: true,
                  codigoBarras: true,
                  // sku: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      this.logger.error('El error generado es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  update(
    id: number,
    updatePurchaseRequisitionDto: UpdatePurchaseRequisitionDto,
  ) {
    return `This action updates a #${id} purchaseRequisition`;
  }

  remove(id: number) {
    return `This action removes a #${id} purchaseRequisition`;
  }

  /**
   *
   */
  async createCompraFromRequisiciones(
    createPurchaseRequisitionDto: CreatePurchaseRequisitionDto,
    opts?: { proveedorId?: number; sucursalId?: number },
  ) {
    try {
      this.logger.log('La data del envio es: ', createPurchaseRequisitionDto);
      const { requisicionID, userID, proveedorId } =
        createPurchaseRequisitionDto;

      const recordCreated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.compra.findFirst({
          where: { requisicionId: requisicionID },
          include: { detalles: true },
        });
        if (existing) {
          throw new BadRequestException('La requisición ya tiene una compra');
        }

        const req = await tx.requisicion.findUniqueOrThrow({
          where: { id: requisicionID },
          include: {
            sucursal: { select: { id: true } },
            lineas: {
              include: {
                producto: { select: { id: true, precioCostoActual: true } },
                presentacion: {
                  select: {
                    id: true,
                    productoId: true,
                    costoReferencialPresentacion: true,
                  },
                },
              },
            },
          },
        });

        this.logger.log(
          'El registro de requisicion que va a compras es: ',
          req,
        );

        if (!req.lineas.length) {
          throw new BadRequestException('La requisición no tiene líneas');
        }

        const detallesData = req.lineas.map((ln) => {
          const costoUnitario =
            ln.precioUnitario ??
            ln.presentacion?.costoReferencialPresentacion ??
            ln.producto.precioCostoActual ??
            0;

          // sanity: si viene presentacion, debe pertenecer al mismo producto
          if (
            ln.presentacion &&
            ln.presentacion.productoId !== ln.producto.id
          ) {
            throw new BadRequestException(
              `Inconsistencia: la presentación ${ln.presentacion.id} no pertenece al producto ${ln.producto.id} (línea ${ln.id}).`,
            );
          }

          return {
            cantidad: ln.cantidadSugerida,
            costoUnitario,
            productoId: ln.producto.id,
            presentacionId: ln.presentacion?.id ?? null,
            requisicionLineaId: ln.id,
            fechaVencimiento: ln.fechaExpiracion,
          };
        });

        const compra = await tx.compra.create({
          data: {
            fecha: dayjs().tz(TZGT).toDate(),
            total: 0,
            usuario: { connect: { id: userID } },
            sucursal: { connect: { id: opts?.sucursalId ?? req.sucursal.id } },
            requisicion: { connect: { id: req.id } },
            estado: 'ESPERANDO_ENTREGA',
            origen: 'REQUISICION',
          },
        });

        for (const d of detallesData) {
          await tx.compraDetalle.create({
            data: {
              cantidad: d.cantidad,
              costoUnitario: Number(d.costoUnitario),
              producto: { connect: { id: d.productoId } },
              ...(d.presentacionId
                ? { presentacion: { connect: { id: d.presentacionId } } }
                : {}),
              compra: { connect: { id: compra.id } },
              requisicionLinea: { connect: { id: d.requisicionLineaId } },
              fechaVencimiento: d.fechaVencimiento ?? null,
            },
          });
        }

        // 6) Recalcular total (puedes calcular a partir de detallesData y ahorrarte esta query si quieres)
        const detalles = await tx.compraDetalle.findMany({
          where: { compraId: compra.id },
          select: { cantidad: true, costoUnitario: true },
        });
        const total = detalles.reduce(
          (acc, it) => acc + it.cantidad * it.costoUnitario,
          0,
        );

        // 7) Actualizar compra con total y proveedor
        await tx.compra.update({
          where: { id: compra.id },
          data: {
            total,
            proveedor: proveedorId
              ? { connect: { id: proveedorId } }
              : undefined,
          },
        });

        // 8) Marcar requisición como enviada a compras
        await tx.requisicion.update({
          where: { id: req.id },
          data: { estado: 'ENVIADA_COMPRAS' },
        });

        const compraCreated = await tx.compra.findUnique({
          where: { id: compra.id },
          include: {
            detalles: {
              include: {
                producto: true,
                presentacion: true,
                requisicionLinea: true,
              },
            },
            proveedor: true,
            sucursal: true,
          },
        });
        this.logger.log('El registro de compra creado es: ', compraCreated);

        if (createPurchaseRequisitionDto.presupuestoId) {
          await this.presupuestoService.comprometerSaldo(
            createPurchaseRequisitionDto.presupuestoId,
            total,
            req.id,
            userID,
            tx,
          );

          if (!req.presupuestoId) {
            await tx.requisicion.update({
              where: { id: createPurchaseRequisitionDto.requisicionID },
              data: {
                presupuestoId: createPurchaseRequisitionDto.presupuestoId,
              },
            });
          } else if (
            req.presupuestoId !== createPurchaseRequisitionDto.requisicionID
          ) {
            throw new BadRequestException(
              `La requisición ${createPurchaseRequisitionDto.requisicionID} ya está ligada a otro presupuesto (${req.presupuestoId})`,
            );
          }
        }

        // 9) Respuesta enriquecida
        return tx.compra.findUnique({
          where: { id: compra.id },
          include: {
            detalles: {
              include: {
                producto: true,
                presentacion: true,
                requisicionLinea: true,
              },
            },
            proveedor: true,
            sucursal: true,
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('No fue posible crear la compra');
    }
  }

  //AJUSTAR
}
