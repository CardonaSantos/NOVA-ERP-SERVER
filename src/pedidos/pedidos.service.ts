import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { dayjs } from 'src/utils/dayjs';
import { TZGT } from 'src/utils/utils';
import { GetPedidosQueryDto } from './Querys/getPedidosQuery.dto';
import { Prisma } from '@prisma/client';
import { GetProductosToPedidosQuery } from './Querys/get-pedidos-query.dto';
import { UpdatePedidoDto } from './dto/update-pedidos.dto';
import { ReceivePedidoComprasDto } from './dto/sendPedidoToCompras';
import { TipoLinea } from './dto/create-pedido-linea';

type StockPorSucursal = {
  sucursalId: number;
  sucursalNombre: string;
  cantidad: number;
};

type ProductoFormatt = {
  id: number;
  nombre: string;
  codigoProducto: string;
  codigoProveedor: string;
  descripcion: string | null;
  stockPorSucursal: StockPorSucursal[];
};

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Actualiza costo de una presentación si trae flag y precio válido (>0) */
  private async actualizarPrecioPresentacion(
    tx: Prisma.TransactionClient,
    precioNuevo: number | null | undefined,
    presentacionID: number | null | undefined,
    actualizarCosto: boolean | null | undefined,
  ) {
    if (!actualizarCosto || !presentacionID || !precioNuevo || precioNuevo <= 0)
      return;

    await tx.productoPresentacion.update({
      where: { id: presentacionID },
      data: { costoReferencialPresentacion: precioNuevo },
    });

    this.logger.log(
      `Presentación ${presentacionID} costo actualizado a: ${precioNuevo}`,
    );
  }

  /** Actualiza costo de un producto si trae flag y precio válido (>0) */
  private async actualizarPrecioProducto(
    tx: Prisma.TransactionClient,
    precioNuevo: number | null | undefined,
    productoID: number | null | undefined,
    actualizarCosto: boolean | null | undefined,
  ) {
    if (!actualizarCosto || !productoID || !precioNuevo || precioNuevo <= 0)
      return;

    await tx.producto.update({
      where: { id: productoID },
      data: { precioCostoActual: precioNuevo },
    });

    this.logger.log(
      `Producto ${productoID} costo actualizado a: ${precioNuevo}`,
    );
  }

  /**
   * Crea un pedido con sus líneas.
   * - Usa precio efectivo = (dto.precioUnitario ?? precioBD).
   * - Si viene actualizarCosto=true, actualiza costo maestro (producto/presentación).
   * - Calcula subtotal en backend.
   */
  async createPedidoMain(dto: CreatePedidoDto) {
    try {
      const {
        clienteId,
        lineas,
        sucursalId,
        usuarioId,
        observaciones,
        prioridad,
        tipo,
      } = dto;

      this.logger.log(`DTO recibido:\n${JSON.stringify(dto, null, 2)}`);

      if (!lineas?.length) {
        throw new BadRequestException('Debe incluir al menos una línea.');
      }

      return await this.prisma.$transaction(async (tx) => {
        // 1) Header del pedido
        const pedidoHead = await tx.pedido.create({
          data: {
            folio: '',
            estado: 'PENDIENTE',
            observaciones: observaciones ?? null,
            cliente: clienteId ? { connect: { id: clienteId } } : {},
            sucursal: { connect: { id: sucursalId } },
            usuario: { connect: { id: usuarioId } },
            prioridad,
            tipo,
          },
          select: { id: true },
        });

        //Separar líneas por tipo
        const lineasProductos = lineas.filter(
          (l) => l.tipo === TipoLinea.PRODUCTO,
        );
        const lineasPresentaciones = lineas.filter(
          (l) => l.tipo === TipoLinea.PRESENTACION,
        );

        //  IDs únicos para fetch
        const productIds = Array.from(
          new Set(lineasProductos.map((l) => l.productoId!).filter(Boolean)),
        );
        const presentacionesIds = Array.from(
          new Set(
            lineasPresentaciones.map((l) => l.presentacionId!).filter(Boolean),
          ),
        );

        // Fetch precios actuales (BD)
        const [productos, presentaciones] = await Promise.all([
          productIds.length
            ? tx.producto.findMany({
                where: { id: { in: productIds } },
                select: { id: true, precioCostoActual: true },
              })
            : Promise.resolve([]),
          presentacionesIds.length
            ? tx.productoPresentacion.findMany({
                where: { id: { in: presentacionesIds } }, // 👈 corregido (antes usaba productIds)
                select: { id: true, costoReferencialPresentacion: true },
              })
            : Promise.resolve([]),
        ]);

        // Sanity check existencia
        if (productos.length !== productIds.length) {
          const found = new Set(productos.map((p) => p.id));
          const missing = productIds.filter((id) => !found.has(id));
          throw new BadRequestException(
            `Productos no encontrados: ${missing.join(', ')}`,
          );
        }
        if (presentaciones.length !== presentacionesIds.length) {
          const found = new Set(presentaciones.map((p) => p.id));
          const missing = presentacionesIds.filter((id) => !found.has(id));
          throw new BadRequestException(
            `Presentaciones no encontradas: ${missing.join(', ')}`,
          );
        }

        // Mapas clave->precio BD
        const priceByProduct = new Map<number, number>(
          productos.map((p) => [p.id, p.precioCostoActual]),
        );
        const priceByPresentacion = new Map<number, number>(
          presentaciones.map((pp) => [pp.id, pp.costoReferencialPresentacion]),
        );

        //Actualizaciones de costos (si vienen flags)
        await Promise.all([
          ...lineasPresentaciones.map((lp) =>
            this.actualizarPrecioPresentacion(
              tx,
              lp.precioCostoActual ?? lp.precioUnitario, // preferimos costoActual que mandas; si no, el unitario
              lp.presentacionId,
              lp.actualizarCosto,
            ),
          ),
          // Productos
          ...lineasProductos.map((lp) =>
            this.actualizarPrecioProducto(
              tx,
              lp.precioCostoActual ?? lp.precioUnitario, // idem
              lp.productoId,
              lp.actualizarCosto,
            ),
          ),
        ]);

        // Construcción de líneas a insertar — PRODUCTOS
        const linesProductosData = lineasProductos.map((l) => {
          // precio efectivo = override (dto) o BD
          const precioBD = priceByProduct.get(l.productoId!);
          const unit = l.precioUnitario ?? precioBD;

          if (unit == null) {
            throw new BadRequestException(
              `Producto ${l.productoId} no tiene precioUnitario válido.`,
            );
          }
          const subtotal = unit * l.cantidad;

          return {
            pedidoId: pedidoHead.id,
            productoId: l.productoId!,
            cantidad: l.cantidad,
            precioUnitario: unit,
            subtotal,
            notas: l.notas ?? null,
            fechaExpiracion: dayjs(l.fechaVencimiento).tz(TZGT).toDate(),
            // presentacionId queda null para este tipo
          };
        });

        // Construcción de líneas a insertar — PRESENTACIONES
        const linesPresentacionesData = lineasPresentaciones.map((lpp) => {
          const precioBD = priceByPresentacion.get(lpp.presentacionId!);
          const unit = lpp.precioUnitario ?? precioBD;

          if (unit == null) {
            throw new BadRequestException(
              `Presentación ${lpp.presentacionId} no tiene precioUnitario válido.`,
            );
          }
          const subtotal = unit * lpp.cantidad;

          return {
            pedidoId: pedidoHead.id,
            productoId: lpp.productoId!,
            presentacionId: lpp.presentacionId!,
            cantidad: lpp.cantidad,
            precioUnitario: unit,
            subtotal,
            notas: lpp.notas ?? null,
            fechaExpiracion: dayjs(lpp.fechaVencimiento).tz(TZGT).toDate(),
          };
        });

        // Inserciones en bloque (createMany no acepta "where")
        if (linesProductosData.length) {
          await tx.pedidoLinea.createMany({ data: linesProductosData });
        }
        if (linesPresentacionesData.length) {
          await tx.pedidoLinea.createMany({ data: linesPresentacionesData });
        }

        //  Totales y folio
        const allLines = [...linesProductosData, ...linesPresentacionesData];
        const totalLineas = allLines.length;
        const totalPedido = allLines.reduce((acc, it) => acc + it.subtotal, 0);

        const anio = dayjs().tz(TZGT).format('YYYY');
        const folio = `PED-${anio}-${String(pedidoHead.id).padStart(4, '0')}`;

        await tx.pedido.update({
          where: { id: pedidoHead.id },
          data: { folio, totalLineas, totalPedido },
        });

        // Devuelve el pedido completo
        const created = await tx.pedido.findUnique({
          where: { id: pedidoHead.id },
          select: {
            id: true,
            folio: true,
            fecha: true,
            estado: true,
            observaciones: true,
            totalLineas: true,
            totalPedido: true,
            creadoEn: true,
            actualizadoEn: true,
            cliente: { select: { id: true, nombre: true } },
            sucursal: { select: { id: true, nombre: true } },
            usuario: { select: { id: true, nombre: true } },
            lineas: {
              select: {
                id: true,
                productoId: true,
                presentacionId: true,
                cantidad: true,
                precioUnitario: true,
                subtotal: true,
                notas: true,
                producto: {
                  select: {
                    id: true,
                    nombre: true,
                    codigoProducto: true,
                    precioCostoActual: true,
                    categorias: { select: { id: true, nombre: true } },
                  },
                },
                presentacion: {
                  select: {
                    id: true,
                    nombre: true,
                    costoReferencialPresentacion: true,
                  },
                },
              },
              orderBy: { id: 'asc' },
            },
          },
        });

        return created;
      });
    } catch (error) {
      this.logger.error('El error generado es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  async sendPedidoToCompras(dto: ReceivePedidoComprasDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { pedidoId, proveedorId, userID, sucursalId } = dto;

        // 0) Evitar compras duplicadas
        const existing = await tx.compra.findFirst({
          where: { pedido: { id: pedidoId } },
          include: { detalles: true },
        });
        if (existing)
          throw new BadRequestException(
            'El pedido ya tiene una compra asignada',
          );

        // 1) Traer líneas con presentacionId
        const pedido = await tx.pedido.findUnique({
          where: { id: pedidoId },
          select: {
            id: true,
            sucursalId: true,
            lineas: {
              select: {
                id: true,
                cantidad: true,
                precioUnitario: true,
                productoId: true,
                presentacionId: true,
                fechaExpiracion: true,

                presentacion: { select: { id: true, productoId: true } }, // sanity check
              },
            },
          },
        });
        if (!pedido) throw new NotFoundException('Pedido no encontrado');
        if (pedido.lineas.length === 0) {
          throw new InternalServerErrorException(
            'El pedido tiene lineas vacías',
          );
        }

        // 2) Mapear detalles, copiando presentacionId
        const detallesToCompra = pedido.lineas.map((ln) => {
          // sanity: si trae presentación, debe pertenecer al mismo producto
          if (
            ln.presentacionId &&
            ln.presentacion?.productoId !== ln.productoId
          ) {
            throw new BadRequestException(
              `La presentación ${ln.presentacionId} no pertenece al producto ${ln.productoId} (pedidoLinea ${ln.id}).`,
            );
          }
          return {
            id: ln.id,
            cantidad: ln.cantidad,
            costoUnitario: ln.precioUnitario,
            productoId: ln.productoId,
            presentacionId: ln.presentacionId ?? null,
            fechaVencimiento: ln.fechaExpiracion,
          };
        });

        // Log de control
        const baseCount = detallesToCompra.filter(
          (d) => !d.presentacionId,
        ).length;
        const presCount = detallesToCompra.length - baseCount;
        this.logger.debug(
          `[PED→COMPRA] base:${baseCount} pres:${presCount} (pedido #${pedidoId})`,
        );

        // 3) Crear cabecera de compra
        const compra = await tx.compra.create({
          data: {
            fecha: dayjs().tz(TZGT).toDate(),
            total: 0,
            usuario: { connect: { id: userID } },
            sucursal: { connect: { id: sucursalId ?? pedido.sucursalId } },
            pedido: { connect: { id: pedido.id } },
            proveedor: { connect: { id: proveedorId } },
            origen: 'PEDIDO', // opcional, pero claro
            estado: 'ESPERANDO_ENTREGA',
          },
        });

        // 4) Crear detalles (con presentacionId cuando exista)
        for (const linea of detallesToCompra) {
          await tx.compraDetalle.create({
            data: {
              cantidad: linea.cantidad,
              costoUnitario: linea.costoUnitario,
              producto: { connect: { id: linea.productoId } },
              ...(linea.presentacionId
                ? { presentacion: { connect: { id: linea.presentacionId } } }
                : {}),
              compra: { connect: { id: compra.id } },
              fechaVencimiento: linea.fechaVencimiento,
            },
          });
        }

        // 5) Recalcular total
        const detallesCompra = await tx.compraDetalle.findMany({
          where: { compraId: compra.id },
          select: { cantidad: true, costoUnitario: true },
        });
        const totalCompra = detallesCompra.reduce(
          (acc, it) => acc + it.cantidad * it.costoUnitario,
          0,
        );

        await tx.compra.update({
          where: { id: compra.id },
          data: { total: totalCompra },
        });

        // 6) Marcar pedido
        await tx.pedido.update({
          where: { id: pedido.id },
          data: { estado: 'ENVIADO_COMPRAS' },
        });

        // 7) Respuesta
        return tx.compra.findUnique({
          where: { id: compra.id },
          include: {
            detalles: { include: { producto: true, presentacion: true } }, // 👈 útil para revisar
            proveedor: true,
            sucursal: true,
          },
        });
      });
    } catch (error) {
      this.logger.debug('El error generado es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en enviar pedidos a compras',
      );
    }
  }

  async getPedidos(query: GetPedidosQueryDto) {
    try {
      const {
        page = 1,
        pageSize = 10,
        search,
        estado,
        sucursalId,
        clienteId,
        fechaFrom,
        fechaTo,
        sortBy,
        sortDir,
        productoId,
      } = query;

      const skip = (page - 1) * pageSize;
      const take = Number(pageSize);
      const sucursalIdNum = sucursalId ? Number(sucursalId) : undefined;
      const clienteIdNum = clienteId ? Number(clienteId) : undefined;
      const productoIdNum = productoId ? Number(productoId) : undefined;
      // ---------- WHERE (filtros + búsqueda) ----------
      const where: Prisma.PedidoWhereInput = {
        ...(estado ? { estado } : {}),
        ...(sucursalIdNum ? { sucursalId: sucursalIdNum } : {}),
        ...(clienteIdNum ? { clienteId: clienteIdNum } : {}),
        ...(fechaFrom || fechaTo
          ? {
              fecha: {
                ...(fechaFrom ? { gte: new Date(fechaFrom) } : {}),
                ...(fechaTo ? { lte: new Date(fechaTo) } : {}),
              },
            }
          : {}),
        ...(productoIdNum
          ? {
              lineas: {
                some: { productoId: productoIdNum },
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { folio: { contains: search, mode: 'insensitive' } },
                { observaciones: { contains: search, mode: 'insensitive' } },
                {
                  cliente: {
                    nombre: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  sucursal: {
                    nombre: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  usuario: {
                    nombre: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  lineas: {
                    some: {
                      OR: [
                        {
                          producto: {
                            nombre: { contains: search, mode: 'insensitive' },
                          },
                        },
                        {
                          producto: {
                            codigoProducto: {
                              contains: search,
                              mode: 'insensitive',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      };

      // ---------- ORDER BY (seguro) ----------
      const dir: Prisma.SortOrder = sortDir === 'asc' ? 'asc' : 'desc';
      const orderBy: Prisma.PedidoOrderByWithRelationInput =
        sortBy === 'folio'
          ? { folio: dir }
          : sortBy === 'estado'
            ? { estado: dir }
            : sortBy === 'totalPedido'
              ? { totalPedido: dir }
              : sortBy === 'totalLineas'
                ? { totalLineas: dir }
                : sortBy === 'creadoEn'
                  ? { creadoEn: dir }
                  : sortBy === 'actualizadoEn'
                    ? { actualizadoEn: dir }
                    : sortBy === 'clienteNombre'
                      ? { cliente: { nombre: dir } }
                      : sortBy === 'sucursalNombre'
                        ? { sucursal: { nombre: dir } }
                        : // default
                          { fecha: 'desc' };

      // ---------- SELECT “definitivo” (pedido + líneas + producto) ----------
      const select = {
        id: true,
        folio: true,
        fecha: true,
        estado: true as const,
        observaciones: true,
        totalLineas: true,
        totalPedido: true,
        creadoEn: true,
        actualizadoEn: true,
        tipo: true,
        prioridad: true,

        // Cabeceras relacionadas (para table & quick-view)
        cliente: { select: { id: true, nombre: true } },
        sucursal: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },

        // Si enlazas contra compra:
        compra: { select: { id: true, estado: true } },

        // Contadores útiles
        _count: { select: { lineas: true } },

        // Líneas + producto (minimal “mejorcito”)
        lineas: {
          select: {
            id: true,
            pedidoId: true,
            productoId: true,
            cantidad: true,
            precioUnitario: true,
            subtotal: true,
            notas: true,
            creadoEn: true,
            actualizadoEn: true,
            producto: {
              select: {
                id: true,
                nombre: true,
                codigoProducto: true,
                precioCostoActual: true,
                categorias: {
                  select: { id: true, nombre: true },
                },
              },
            },
          },
          orderBy: { id: 'asc' }, // líneas ordenadas consistentemente
        },
      } satisfies Prisma.PedidoSelect;

      // ---------- Query + Count (transacción) ----------
      const [data, totalItems] = await this.prisma.$transaction([
        this.prisma.pedido.findMany({
          where,
          select,
          orderBy,
          skip,
          take,
        }),
        this.prisma.pedido.count({ where }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

      // ---------- Normalización útil para la UI ----------
      // Asegura totalPedido (por si en algún registro está null)
      const normalized = data.map((p) => ({
        ...p,
        totalPedido:
          p.totalPedido ??
          p.lineas.reduce(
            (acc, ln) =>
              acc + (ln.subtotal ?? ln.cantidad * (ln.precioUnitario ?? 0)),
            0,
          ),
      }));

      return {
        data: normalized,
        page,
        pageSize,
        totalItems,
        totalPages,
        sortBy: sortBy ?? 'fecha',
        sortDir: sortDir ?? 'desc',
      };
    } catch (error) {
      this.logger?.error('getPedidos error', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  // ANTERIOR
  // async getProductsToPedidos(query: GetProductosToPedidosQuery) {
  //   const {
  //     page = 1,
  //     pageSize = 10,
  //     nombre,
  //     codigoProducto,
  //     search,
  //     codigoProveedor,
  //   } = query;
  //   console.log(
  //     'Las props son: ',
  //     page,
  //     pageSize,
  //     nombre,
  //     codigoProducto,
  //     codigoProveedor,
  //     search,
  //   );

  //   const where: Prisma.ProductoWhereInput = search
  //     ? {
  //         OR: [
  //           { nombre: { contains: search, mode: 'insensitive' } },
  //           { codigoProducto: { contains: search, mode: 'insensitive' } },
  //           { codigoProveedor: { contains: search, mode: 'insensitive' } },
  //         ],
  //       }
  //     : {};

  //   const skip = (page - 1) * pageSize;
  //   const take = Number(pageSize);

  //   const [products, totalItems] = await this.prisma.$transaction([
  //     this.prisma.producto.findMany({
  //       where,
  //       skip,
  //       take,
  //       select: {
  //         id: true,
  //         nombre: true,
  //         codigoProducto: true,
  //         codigoProveedor: true,
  //         descripcion: true,
  //         precioCostoActual: true,
  //         stock: {
  //           select: {
  //             cantidad: true,
  //             sucursal: { select: { id: true, nombre: true } },
  //           },
  //         },
  //       },
  //     }),
  //     this.prisma.producto.count({ where }),
  //   ]);

  //   const productosFormatt = products.map((p) => {
  //     const stockPorSucursal = p.stock.reduce<Record<number, StockPorSucursal>>(
  //       (acc, s) => {
  //         const suc = s.sucursal;
  //         if (!acc[suc.id]) {
  //           acc[suc.id] = {
  //             sucursalId: suc.id,
  //             sucursalNombre: suc.nombre,
  //             cantidad: 0,
  //           };
  //         }
  //         acc[suc.id].cantidad += s.cantidad;
  //         return acc;
  //       },
  //       {},
  //     );
  //     return {
  //       id: p.id,
  //       nombre: p.nombre,
  //       codigoProducto: p.codigoProducto,
  //       codigoProveedor: p.codigoProveedor,
  //       descripcion: p.descripcion,
  //       stockPorSucursal: Object.values(stockPorSucursal),
  //       precioCostoActual: p.precioCostoActual,
  //     };
  //   });

  //   const totalPages = Math.ceil(totalItems / pageSize);

  //   return {
  //     data: productosFormatt,
  //     page,
  //     pageSize,
  //     totalItems,
  //     totalPages,
  //   };
  // }

  async getProductsToPedidos(query: GetProductosToPedidosQuery) {
    const {
      page = 1,
      pageSize = 10,
      nombre,
      codigoProducto,
      search,
      codigoProveedor,
      sucursalId, // opcional: si viene, filtramos stock por esa sucursal
    } = query;

    const where: Prisma.ProductoWhereInput = search
      ? {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { codigoProducto: { contains: search, mode: 'insensitive' } },
            { codigoProveedor: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {
          ...(nombre
            ? { nombre: { contains: nombre, mode: 'insensitive' } }
            : {}),
          ...(codigoProducto
            ? {
                codigoProducto: {
                  contains: codigoProducto,
                  mode: 'insensitive',
                },
              }
            : {}),
          ...(codigoProveedor
            ? {
                codigoProveedor: {
                  contains: codigoProveedor,
                  mode: 'insensitive',
                },
              }
            : {}),
        };

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Math.max(1, Number(pageSize));

    const [products, totalItems] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          nombre: true,
          codigoProducto: true,
          codigoProveedor: true,
          descripcion: true,
          precioCostoActual: true,
          unidadBase: true, // se mantiene para UI

          // Stock base (unidades base). Si viene sucursalId, filtramos.
          stock: {
            where: sucursalId ? { sucursalId } : undefined,
            select: {
              cantidad: true,
              sucursal: { select: { id: true, nombre: true } },
            },
          },

          // Presentaciones SIN factorUnidadBase
          presentaciones: {
            select: {
              id: true,
              nombre: true,
              esDefault: true,
              activo: true,
              // sku: true,
              codigoBarras: true,
              tipoPresentacion: true,
              costoReferencialPresentacion: true,
              stockPresentaciones: {
                where: sucursalId ? { sucursalId } : undefined,
                select: {
                  cantidadPresentacion: true,
                  sucursal: { select: { id: true, nombre: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.producto.count({ where }),
    ]);

    const productosFormatt = products.map((p) => {
      // --- Agregado de stock base por sucursal ---
      const stockPorSucursal = p.stock.reduce<Record<number, StockPorSucursal>>(
        (acc, s) => {
          const suc = s.sucursal;
          if (!acc[suc.id]) {
            acc[suc.id] = {
              sucursalId: suc.id,
              sucursalNombre: suc.nombre,
              cantidad: 0,
            };
          }
          acc[suc.id].cantidad += s.cantidad;
          return acc;
        },
        {},
      );

      // --- Presentaciones + stock por sucursal (en PRESENTACIONES) ---
      const presentaciones = p.presentaciones.map((pr) => {
        const agg = pr.stockPresentaciones.reduce<
          Record<number, StockPorSucursal>
        >((acc, sp) => {
          const suc = sp.sucursal;
          if (!acc[suc.id]) {
            acc[suc.id] = {
              sucursalId: suc.id,
              sucursalNombre: suc.nombre,
              cantidad: 0,
            };
          }
          acc[suc.id].cantidad += sp.cantidadPresentacion;
          return acc;
        }, {});

        return {
          id: pr.id,
          nombre: pr.nombre,
          esDefault: pr.esDefault,
          activo: pr.activo,
          // sku: pr.sku ?? null,
          codigoBarras: pr.codigoBarras ?? null,
          tipoPresentacion: pr.tipoPresentacion,
          costoReferencialPresentacion:
            pr.costoReferencialPresentacion != null
              ? Number(pr.costoReferencialPresentacion)
              : null,
          stockPorSucursal: Object.values(agg), // cantidades de PRESENTACIONES por sucursal
        };
      });

      return {
        id: p.id,
        nombre: p.nombre,
        codigoProducto: p.codigoProducto,
        codigoProveedor: p.codigoProveedor,
        descripcion: p.descripcion,
        unidadBase: p.unidadBase ?? 'unidades',
        precioCostoActual: p.precioCostoActual ?? 0,

        // stock base (unidades base) por sucursal
        stockPorSucursal: Object.values(stockPorSucursal),

        // presentaciones (sin factorUnidadBase)
        presentaciones,
      };
    });

    const totalPages = Math.ceil(totalItems / take);

    return {
      data: productosFormatt,
      page: Number(page),
      pageSize: take,
      totalItems,
      totalPages,
    };
  }

  async deletePedidoRegist(pedidoID: number) {
    try {
      if (!pedidoID) {
        throw new BadRequestException('ID de pedido no valido');
      }

      const deleteRegist = await this.prisma.pedido.delete({
        where: {
          id: pedidoID,
        },
      });
      return deleteRegist;
    } catch (error) {
      this.logger.error('El error en delete pedido es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error en delete registro pedido',
      );
    }
  }

  // ACTUALIZACION Y UPDATE
  async getPedidoById(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        cliente: {
          select: { id: true, nombre: true, apellidos: true },
        },
        sucursal: {
          select: { id: true, nombre: true },
        },
        lineas: {
          include: {
            producto: {
              select: {
                id: true,
                nombre: true,
                codigoProducto: true,
                descripcion: true,
                precioCostoActual: true,
              },
            },
          },
        },
      },
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }

    return pedido;
  }

  async updatePedido(id: number, dto: UpdatePedidoDto) {
    if (!dto.lineas?.length) {
      throw new BadRequestException('Debe incluir al menos una línea.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Traemos precios de los productos
      const productIds = Array.from(
        new Set(dto.lineas.map((l) => l.productoId)),
      );
      const productos = await tx.producto.findMany({
        where: { id: { in: productIds } },
        select: { id: true, precioCostoActual: true },
      });

      if (productos.length !== productIds.length) {
        const found = new Set(productos.map((p) => p.id));
        const missing = productIds.filter((id) => !found.has(id));
        throw new BadRequestException(
          `Productos no encontrados: ${missing.join(', ')}`,
        );
      }

      const priceByProduct = new Map(
        productos.map((p) => [p.id, p.precioCostoActual]),
      );

      // 2. Armar líneas recalculando totales
      const linesData = dto.lineas.map((l) => {
        const pu = priceByProduct.get(l.productoId);
        if (pu == null) {
          throw new BadRequestException(
            `Producto ${l.productoId} no tiene precioCostoActual definido.`,
          );
        }
        const subtotal = pu * l.cantidad;
        return {
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: pu,
          subtotal,
          notas: l.notas ?? null,
        };
      });

      // 3. Borrar líneas anteriores y recrear
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      await tx.pedidoLinea.createMany({
        data: linesData.map((l) => ({
          pedidoId: id,
          ...l,
        })),
      });

      const totalLineas = linesData.length;
      const totalPedido = linesData.reduce((acc, it) => acc + it.subtotal, 0);

      // 4. Actualizar cabecera
      await tx.pedido.update({
        where: { id },
        data: {
          sucursalId: dto.sucursalId,
          clienteId: dto.clienteId,
          prioridad: dto.prioridad,
          tipo: dto.tipo,
          observaciones: dto.observaciones ?? null,
          totalLineas,
          totalPedido,
        },
      });

      // 5. Retornar pedido completo actualizado
      return tx.pedido.findUnique({
        where: { id },
        select: {
          id: true,
          folio: true,
          fecha: true,
          estado: true,
          observaciones: true,
          totalLineas: true,
          totalPedido: true,
          cliente: { select: { id: true, nombre: true } },
          sucursal: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true } },
          lineas: {
            select: {
              id: true,
              productoId: true,
              cantidad: true,
              precioUnitario: true,
              subtotal: true,
              notas: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  codigoProducto: true,
                  precioCostoActual: true,
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      });
    });
  }

  // VER UN PEDIDO
  async getPedidoByIdToShow(id: number) {
    try {
      const pedido = await this.prisma.pedido.findUnique({
        where: { id },
        select: {
          id: true,
          folio: true,
          fecha: true,
          estado: true,
          tipo: true,
          prioridad: true,
          observaciones: true,
          totalLineas: true,
          totalPedido: true,
          creadoEn: true,
          actualizadoEn: true,
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellidos: true,
              telefono: true,
              direccion: true,
              observaciones: true,
            },
          },
          sucursal: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true, correo: true } },
          lineas: {
            select: {
              id: true,
              pedidoId: true,
              productoId: true,
              presentacionId: true,
              cantidad: true,
              precioUnitario: true,
              subtotal: true,
              notas: true,
              creadoEn: true,
              actualizadoEn: true,
              fechaExpiracion: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  codigoProducto: true,
                  codigoProveedor: true,
                  descripcion: true,
                  precioCostoActual: true,
                  categorias: { select: { id: true, nombre: true } },
                  imagenesProducto: { take: 1, select: { url: true } },
                },
              },
              presentacion: {
                select: {
                  id: true,
                  nombre: true,
                  codigoBarras: true,
                  // sku: true,
                  tipoPresentacion: true,
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      });

      if (!pedido) {
        throw new NotFoundException(`Pedido con id ${id} no encontrado`);
      }

      // Normalizar totales (por si totalPedido viene nulo)
      const totalPedido =
        pedido.totalPedido ??
        pedido.lineas.reduce(
          (acc, ln) =>
            acc + (ln.subtotal ?? ln.cantidad * (ln.precioUnitario ?? 0)),
          0,
        );

      // Flatten de imagen principal
      return {
        ...pedido,
        totalPedido,
        lineas: pedido.lineas.map((l) => ({
          ...l,
          producto: {
            ...l.producto,
            imagenUrl: l.producto.imagenesProducto?.[0]?.url ?? null,
          },
        })),
      };
    } catch (error) {
      this.logger?.error('getPedidoById error', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  async deleteAll() {
    const deletePedidos = await this.prisma.pedido.deleteMany({});
    this.logger.log(deletePedidos);
  }
}
