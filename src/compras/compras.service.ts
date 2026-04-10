import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateCompraDto } from './dto/create-compra.dto';
import { dayjs } from 'src/utils/dayjs';
import { TZGT } from 'src/utils/utils';
import { EstadoCompra, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProrrateoService } from 'src/prorrateo/prorrateo.service';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';

type StockLineaPresentacionPayload = {
  lineaId: number;
  productoId: number;
  presentacionId: number;
  cantidad: number;
  fechaVencimiento: string;
};

type StockLineaProductoPayload = {
  lineaId?: number; // 👈 nuevo

  productoId: number;
  cantidad: number;
  fechaVencimiento: string | null;
  precioCosto: number;
};

@Injectable()
export class ComprasService {
  private readonly logger = new Logger(ComprasService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly prorrateo: ProrrateoService,
    private readonly mf: MovimientoFinancieroService,
  ) {}

  async create(dto: CreateCompraDto) {
    try {
      this.logger.log(
        `DTO recibido en recepcionar compra parcial:\n${JSON.stringify(dto, null, 2)}`,
      );

      const { compraId, lineas, observaciones, usuarioId, sucursalId } = dto;

      const data = await this.prisma.$transaction(async (tx) => {
        const compra = await tx.compra.findUnique({
          where: { id: compraId },
          select: {
            id: true,
            sucursalId: true,
            detalles: {
              select: {
                id: true,
                productoId: true,
                presentacionId: true,
                cantidad: true,
                fechaVencimiento: true,
              },
            },
          },
        });
        if (!compra) throw new NotFoundException('Compra no encontrada');

        const sucId = compra.sucursalId;
        const detallesMap = new Map(compra.detalles.map((d) => [d.id, d]));

        const cab = await tx.compraRecepcion.create({
          data: {
            compra: { connect: { id: compraId } },
            usuario: { connect: { id: usuarioId } },
            observaciones: observaciones ?? null,
            fecha: dayjs().tz(TZGT).toDate(),
          },
        });

        // Pre-resolver productoId para presentaciones
        const presentacionesIds = lineas
          .filter((l) => l.tipo === 'PRESENTACION')
          .map((l) => l.itemId);

        const presToProd = presentacionesIds.length
          ? new Map(
              (
                await tx.productoPresentacion.findMany({
                  where: { id: { in: presentacionesIds } },
                  select: { id: true, productoId: true },
                })
              ).map((p) => [p.id, p.productoId]),
            )
          : new Map<number, number>();

        // Payloads separados
        const payloadPres: StockLineaPresentacionPayload[] = [];
        const payloadProd: StockLineaProductoPayload[] = [];

        const lineasCreadas = await Promise.all(
          lineas.map(async (l) => {
            const det = detallesMap.get(l.compraDetalleId);
            if (!det) {
              throw new BadRequestException(
                `Detalle ${l.compraDetalleId} no pertenece a la compra.`,
              );
            }

            if (l.tipo === 'PRESENTACION') {
              // === Rama PRESENTACIÓN → StockPresentacion
              const presentacionId = l.itemId;
              const productoId =
                presToProd.get(presentacionId) ??
                (await tx.productoPresentacion
                  .findUnique({
                    where: { id: presentacionId },
                    select: { productoId: true },
                  })
                  .then((p) => p?.productoId || 0));

              if (!productoId) {
                throw new BadRequestException(
                  `Presentación ${presentacionId} no existe o no se pudo resolver productoId.`,
                );
              }

              const linea = await tx.compraRecepcionLinea.create({
                data: {
                  compraRecepcionId: cab.id,
                  compraDetalleId: l.compraDetalleId,
                  productoId,
                  presentacionId, // aquí sí es requerid@ por diseño de StockPresentacion
                  cantidadRecibida: l.cantidadRecibida,
                  fechaExpiracion: l.fechaExpiracion
                    ? dayjs(l.fechaExpiracion).tz(TZGT).startOf('day').toDate()
                    : null,
                },
                select: { id: true },
              });

              payloadPres.push({
                lineaId: linea.id,
                productoId,
                presentacionId,
                cantidad: l.cantidadRecibida,
                fechaVencimiento: l.fechaExpiracion ?? null,
              });

              return { id: linea.id };
            } else {
              const productoId = l.itemId;

              const linea = await tx.compraRecepcionLinea.create({
                data: {
                  compraRecepcionId: cab.id,
                  compraDetalleId: l.compraDetalleId,
                  productoId,
                  cantidadRecibida: l.cantidadRecibida,
                  fechaExpiracion: l.fechaExpiracion
                    ? dayjs(l.fechaExpiracion).tz(TZGT).startOf('day').toDate()
                    : null,
                },
                select: { id: true },
              });

              payloadProd.push({
                lineaId: linea.id,
                productoId,
                cantidad: l.cantidadRecibida,
                fechaVencimiento: l.fechaExpiracion ?? null,
                precioCosto: Number(l.precioCosto ?? 0),
              });

              return { id: linea.id };
            }
          }),
        );

        // Crear lotes en ambas tablas según corresponda
        const stocksPres = await this.createStockPresentaciones(
          tx,
          payloadPres,
          sucId,
          cab.id,
        );

        const stocksProd = await this.createStockProductos(
          tx,
          payloadProd,
          sucId,
          cab.id,
        );

        await this.updateCompraEstado(tx, compraId);

        // =========================
        //  NUEVO: MF + PRORRATEO
        // =========================
        // 1) Movimiento financiero del costo asociado (si viene en dto.mf)
        let mfRecord: { id: number } | null = null;
        if (
          dto.mf &&
          dto.mf.motivo === 'COSTO_ASOCIADO' &&
          Number(dto.mf.monto) > 0
        ) {
          const metodo = dto.mf.metodoPago;
          const isBanco = ['TRANSFERENCIA', 'TARJETA', 'CHEQUE'].includes(
            metodo,
          );
          const isCaja = ['EFECTIVO', 'CONTADO'].includes(metodo);

          if (isBanco && !dto.mf.cuentaBancariaId) {
            throw new BadRequestException(
              'Selecciona la cuenta bancaria para pagos por banco.',
            );
          }
          if (isCaja && !dto.mf.registroCajaId) {
            throw new BadRequestException(
              'Selecciona la caja para pagos en efectivo/contado.',
            );
          }

          const mfDto = {
            usuarioId: dto.usuarioId,
            monto: Number(dto.mf.monto),
            motivo: 'COSTO_ASOCIADO' as const,
            metodoPago: metodo,
            descripcion: dto.mf.descripcion,
            sucursalId: dto.mf.sucursalId ?? sucId,
            costoVentaTipo: dto.mf.costoVentaTipo,
            clasificacionAdmin: 'COSTO_VENTA' as const,
            proveedorId: dto.mf.proveedorId ?? null,
            cuentaBancariaId: dto.mf.cuentaBancariaId,
            registroCajaId: dto.mf.registroCajaId,
            afectaInventario: true,
          };

          // 👇 MUY importante: en la misma transacción
          const mfCreado = await this.mf.createMovimiento(mfDto, { tx });
          mfRecord = { id: mfCreado.id };
        }

        // 2) Prorrateo (por LOTES NUEVOS) si viene activado
        const aplicar =
          (dto.prorrateo?.aplicar ?? dto.aplicarProrrateo ?? false) &&
          Number(dto.mf?.monto ?? 0) > 0;

        if (aplicar) {
          const newStockIds = (stocksProd ?? []).map((s) => s.id);
          const newStocksPresIds = (stocksPres ?? []).map((s) => s.id);

          await this.prorrateo.generarProrrateoUnidadesTx(tx, {
            sucursalId: sucId,
            compraId,
            compraRecepcionId: cab.id, // 👈 Modo A
            gastosAsociadosCompra: Number(dto.mf!.monto),
            movimientoFinancieroId: mfRecord?.id ?? null,
            comentario: `Prorrateo UNIDADES – Compra #${compraId} – Recepción #${cab.id}`,

            // fallback si algún día decides forzar Modo B:
            newStockIds,
            newStocksPresIds,
          });
        }

        return {
          recepcionId: cab.id,
          lineas: lineasCreadas.map((x) => x.id),
          stocksPresentacion: stocksPres.map((s) => s.id),
          stocksProducto: stocksProd.map((s) => s.id),
        };
      });

      //registrar el prorrateo

      return { ok: true, data };
    } catch (error) {
      this.logger.error(
        'Error generado en crear recepcion compra parcial: ',
        (error as any)?.stack ?? error,
      );
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado en recepción de compras parcial',
      );
    }
  }

  //CREAR STOCKS
  async createStockPresentaciones(
    tx: Prisma.TransactionClient,
    items: StockLineaPresentacionPayload[],
    sucursalId: number,
    recepcionId: number,
  ) {
    this.logger.log(
      'El payload cargado a create presentaciones stock es: ',
      items,
    );
    const created = await Promise.all(
      items.map(async (it) => {
        const stock = await tx.stockPresentacion.create({
          data: {
            producto: { connect: { id: it.productoId } },
            presentacion: { connect: { id: it.presentacionId } },
            sucursal: { connect: { id: sucursalId } },
            compraRecepcion: { connect: { id: recepcionId } },
            compraRecepcionLinea: { connect: { id: it.lineaId } }, // 1–1
            cantidadRecibidaInicial: it.cantidad,
            cantidadPresentacion: it.cantidad,
            fechaIngreso: dayjs().tz(TZGT).toDate(),
            fechaVencimiento: it.fechaVencimiento
              ? dayjs(it.fechaVencimiento).tz(TZGT).startOf('day').toDate()
              : null,
          },
          select: { id: true },
        });

        await tx.compraRecepcionLinea.update({
          where: { id: it.lineaId },
          data: { stockPresentacionId: stock.id },
        });

        return stock;
      }),
    );

    return created;
  }

  async createStockProductos(
    tx: Prisma.TransactionClient,
    items: StockLineaProductoPayload[],
    sucursalId: number,
    recepcionId: number,
  ) {
    this.logger.log('El payload cargado a create productos stock es: ', items);
    if (!items.length) return [];

    const created = await Promise.all(
      items.map(async (it) => {
        const stock = await tx.stock.create({
          data: {
            producto: { connect: { id: it.productoId } },
            sucursal: { connect: { id: sucursalId } },
            cantidadInicial: it.cantidad,
            cantidad: it.cantidad,
            precioCosto: it.precioCosto,
            costoTotal: it.precioCosto * it.cantidad,
            fechaIngreso: dayjs().tz(TZGT).toDate(),
            fechaVencimiento: it.fechaVencimiento
              ? dayjs(it.fechaVencimiento).tz(TZGT).startOf('day').toDate()
              : null,
            // 👇 enlaza el lote a la recepción (requisito Modo A)
            compraRecepcion: { connect: { id: recepcionId } },
          },
          select: { id: true },
        });

        // Si migraste tu esquema con `CompraRecepcionLinea.stockId`:
        if (it.lineaId) {
          await tx.compraRecepcionLinea.update({
            where: { id: it.lineaId },
            data: { stockId: stock.id }, // 👈 relación 1–1 en líneas de PRODUCTO
          });
        }

        return stock;
      }),
    );

    return created;
  }
  //CREAR STOCKS

  /**
   *FUNCION QUE RETORNA LA INFO NECESARIA QUE NECESITA EL TABLE DEL PARCIAL
   * @param compraId ID DEL REGISTRO DE COMPRA
   * @returns REGISTRO DE COMPRA CON LINEAS PARA EL TABLE
   */
  async getDataToTableRP(compraId: number) {
    const compra = await this.prisma.compra.findUnique({
      where: { id: compraId },
      select: {
        id: true,
        estado: true,
        detalles: {
          select: {
            id: true,
            cantidad: true,
            costoUnitario: true,
            fechaVencimiento: true,
            presentacion: {
              select: {
                id: true,
                nombre: true,
                codigoBarras: true,
                // sku: true,
                costoReferencialPresentacion: true,
              },
            },
            producto: {
              select: {
                id: true,
                nombre: true,
                codigoProducto: true,
                precioCostoActual: true,
              },
            },
          },
        },
      },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada');

    const detalleIds = compra.detalles.map((d) => d.id);

    // Agrupa recepciones por compraDetalleId
    const recGroup = await this.prisma.compraRecepcionLinea.groupBy({
      by: ['compraDetalleId'],
      where: { compraDetalleId: { in: detalleIds } },
      _sum: { cantidadRecibida: true },
    });

    const recibidasMap = new Map<number, number>(
      recGroup.map((r) => [r.compraDetalleId, r._sum.cantidadRecibida ?? 0]),
    );

    // Normaliza cada detalle y OMITE 'presentacion' y 'producto'
    const detallesConEstado = compra.detalles.map((d) => {
      const recibida = recibidasMap.get(d.id) ?? 0;
      const pendiente = Math.max(0, d.cantidad - recibida);
      const estadoDetalle =
        recibida >= d.cantidad
          ? 'RECIBIDO'
          : recibida > 0
            ? 'PARCIAL'
            : 'PENDIENTE';

      // Construye el objeto producto normalizado (si hay presentacion, úsala)
      const producto = d.presentacion
        ? {
            id: d.presentacion.id,
            nombre: d.presentacion.nombre,
            codigo: d.presentacion.codigoBarras ?? null,
            precioCosto: Number(d.costoUnitario), // costo para esa línea/presentación
            tipo: 'PRESENTACION',
          }
        : {
            id: d.producto.id,
            nombre: d.producto.nombre,
            codigo: d.producto.codigoProducto,
            precioCosto: d.producto.precioCostoActual ?? null,
            tipo: 'PRODUCTO',
          };

      // Destructuring para EXCLUIR 'presentacion' y 'producto'
      const { presentacion, producto: _prod, ...resto } = d;

      return {
        ...resto,
        producto,
        recibida,
        pendiente,
        estadoDetalle,
      };
    });

    // Estado global de compra
    const allOk = detallesConEstado.every(
      (d) => d.estadoDetalle === 'RECIBIDO',
    );
    const anyPartial = detallesConEstado.some(
      (d) => d.estadoDetalle === 'PARCIAL',
    );
    const anyPending = detallesConEstado.some(
      (d) => d.estadoDetalle === 'PENDIENTE',
    );

    const estadoCalculado = allOk
      ? 'RECIBIDO'
      : anyPartial || (!allOk && !anyPending)
        ? 'RECIBIDO_PARCIAL'
        : 'ESPERANDO_ENTREGA';

    return {
      id: compra.id,
      estado: compra.estado,
      estadoCalculado,
      detalles: detallesConEstado,
    };
  }

  /**
   * VERSION HELPER DE GETDATA TABLE
   * @param compraId ID DEL REGISTRO DE COMPRA
   * @returns REGISTRO DE COMPRA CON LINEAS PARA EL TABLE
   */
  async helperCalculateTableEstado(
    tx: Prisma.TransactionClient,
    compraId: number,
  ) {
    const compra = await tx.compra.findUnique({
      where: { id: compraId },
      select: {
        id: true,
        estado: true,
        detalles: {
          select: {
            id: true,
            cantidad: true,
            costoUnitario: true,
            presentacion: {
              select: {
                id: true,
                nombre: true,
                codigoBarras: true,
                // sku: true,
                costoReferencialPresentacion: true,
              },
            },
            producto: {
              select: {
                id: true,
                nombre: true,
                codigoProducto: true,
                precioCostoActual: true,
              },
            },
          },
        },
      },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada');

    const detalleIds = compra.detalles.map((d) => d.id);

    // Agrupa recepciones por compraDetalleId
    const recGroup = await tx.compraRecepcionLinea.groupBy({
      by: ['compraDetalleId'],
      where: { compraDetalleId: { in: detalleIds } },
      _sum: { cantidadRecibida: true },
    });

    const recibidasMap = new Map<number, number>(
      recGroup.map((r) => [r.compraDetalleId, r._sum.cantidadRecibida ?? 0]),
    );

    // Normaliza cada detalle y OMITE 'presentacion' y 'producto'
    const detallesConEstado = compra.detalles.map((d) => {
      const recibida = recibidasMap.get(d.id) ?? 0;
      const pendiente = Math.max(0, d.cantidad - recibida);
      const estadoDetalle =
        recibida >= d.cantidad
          ? 'RECIBIDO'
          : recibida > 0
            ? 'PARCIAL'
            : 'PENDIENTE';

      // Construye el objeto producto normalizado (si hay presentacion, úsala)
      const producto = d.presentacion
        ? {
            id: d.presentacion.id,
            nombre: d.presentacion.nombre,
            codigo: d.presentacion.codigoBarras ?? null,
            precioCosto: Number(d.costoUnitario), // costo para esa línea/presentación
            tipo: 'PRESENTACION',
          }
        : {
            id: d.producto.id,
            nombre: d.producto.nombre,
            codigo: d.producto.codigoProducto,
            precioCosto: d.producto.precioCostoActual ?? null,
            tipo: 'PRODUCTO',
          };

      // Destructuring para EXCLUIR 'presentacion' y 'producto'
      const { presentacion, producto: _prod, ...resto } = d;

      return {
        ...resto,
        producto,
        recibida,
        pendiente,
        estadoDetalle,
      };
    });

    // Estado global de compra
    const allOk = detallesConEstado.every(
      (d) => d.estadoDetalle === 'RECIBIDO',
    );
    const anyPartial = detallesConEstado.some(
      (d) => d.estadoDetalle === 'PARCIAL',
    );
    const anyPending = detallesConEstado.some(
      (d) => d.estadoDetalle === 'PENDIENTE',
    );

    const estadoCalculado: EstadoCompra = allOk
      ? 'RECIBIDO'
      : anyPartial || (!allOk && !anyPending)
        ? 'RECIBIDO_PARCIAL'
        : 'ESPERANDO_ENTREGA';

    return {
      id: compra.id,
      estado: compra.estado,
      estadoCalculado,
      detalles: detallesConEstado,
    };
  }

  // HELPERS =========================>
  /**
   * HELPER: ayuda a actualizar el estado de la compra en general, basando se en otro servicio que revisa linea a linea para saber si los productos ya fueron ingresados correctamente.
   * @param tx Transaccion de la operacion
   * @param compraId ID de compra a revisar
   */
  async updateCompraEstado(tx: Prisma.TransactionClient, compraId: number) {
    try {
      const data = await this.helperCalculateTableEstado(tx, compraId);
      const newEstado = data.estadoCalculado;
      this.logger.log('El nuevo estado calculado es: ', newEstado);
      if (!data)
        throw new BadRequestException(
          'Error en conseguir data para revision de compra',
        );

      await tx.compra.update({
        where: {
          id: compraId,
        },
        data: {
          estado: newEstado,
          ingresadaAStock:
            (data.estadoCalculado as EstadoCompra) === 'RECIBIDO',
        },
      });
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'error inesperado en calcular estado de compras',
      );
    }
  }
}
