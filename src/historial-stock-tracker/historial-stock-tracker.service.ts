import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateHistorialStockTrackerDto } from './dto/create-historial-stock-tracker.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, TipoMovimientoStock } from '@prisma/client';
import { CreateRequisicionRecepcionLineaDto } from 'src/recepcion-requisiciones/dto/requisicion-recepcion-create.dto';
import { dayjs } from 'src/utils/dayjs';

@Injectable()
export class HistorialStockTrackerService {
  private readonly logger = new Logger(HistorialStockTrackerService.name);
  constructor(private readonly prisma: PrismaService) {}

  create(createHistorialStockTrackerDto: CreateHistorialStockTrackerDto) {
    return 'This action adds a new historialStockTracker';
  }

  /**
   * Trackea el movimiento de una requisicion
   * @param tx
   * @param id ID del registro al que queremos linkearlo
   * @param sucursalId
   * @param userId
   * @returns
   */
  async trackerRequisicion(
    tx: Prisma.TransactionClient,
    id: number,
    sucursalId: number,
    userId: number,
  ) {
    try {
      const requisicionExist = await tx.requisicion.findUnique({
        where: {
          id: id,
        },
      });

      if (!requisicionExist) {
        throw new BadRequestException({
          message: 'Error al encontrar registro de requisicion',
        });
      }

      const newTrackerRegist = await tx.historialStock.create({
        data: {
          tipo: TipoMovimientoStock.INGRESO_REQUISICION,
          fechaCambio: dayjs().tz('America/Guatemala').toDate(),
          requisicion: {
            connect: {
              id: id,
            },
          },
          comentario: 'Registro creado por ingreso de requisición',
          sucursal: {
            connect: {
              id: sucursalId,
            },
          },
          usuario: {
            connect: {
              id: userId,
            },
          },
        },
      });

      if (!newTrackerRegist) {
        throw new InternalServerErrorException({
          message: 'Error al crear registor de historial stock',
        });
      }

      this.logger.log('El registro de historial stock es: ', newTrackerRegist);

      return newTrackerRegist;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('El error es: ', error);
      throw new InternalServerErrorException({
        message: 'Fatal error: Error inesperado',
      });
    }
  }

  /**
   *
   * @param tx transaccion
   * @param lineas lineas de productos
   * @param sucursalId sucursal donde ocurrio
   * @param usuarioId el usuario que ejecutó la accion
   * @param requisicionId la requisicion principal
   * @param tipo el tipo de registro que guardaremos
   * @param comentario el comentario del registro
   */
  async trackIngresoProductos(
    tx: Prisma.TransactionClient,
    lineas: CreateRequisicionRecepcionLineaDto[],
    sucursalId: number,
    usuarioId: number,
    requisicionId: number,
    tipo: TipoMovimientoStock = TipoMovimientoStock.INGRESO_REQUISICION,
    comentario: string = '',
  ) {
    const cantidadesAnteriores: Record<number, number> = {};

    await Promise.all(
      lineas.map(async (prod) => {
        const cantidadActual = await tx.stock
          .aggregate({
            _sum: { cantidad: true },
            where: {
              productoId: prod.productoId,
              sucursalId: sucursalId,
            },
          })
          .then((res) => res._sum.cantidad ?? 0);
        cantidadesAnteriores[prod.productoId] = cantidadActual;
      }),
    );

    await Promise.all(
      lineas.map(async (prod) => {
        const cantidadAnterior = cantidadesAnteriores[prod.productoId];
        const cantidadNueva = cantidadAnterior + prod.cantidadRecibida;

        await tx.historialStock.create({
          data: {
            producto: { connect: { id: prod.productoId } },
            sucursal: { connect: { id: sucursalId } },
            usuario: { connect: { id: usuarioId } },
            tipo,
            fechaCambio: dayjs().tz('America/Guatemala').toDate(),
            cantidadAnterior,
            cantidadNueva,
            comentario:
              comentario || `Ingreso por requisición #${requisicionId}`,
            requisicion: { connect: { id: requisicionId } },
          },
        });
      }),
    );
  }

  /**
   *
   * @param tx transaccion
   * @param lineas lineas de productos
   * @param sucursalId sucursal donde ocurrio
   * @param usuarioId el usuario que ejecutó la accion
   * @param requisicionId la requisicion principal
   * @param tipo el tipo de registro que guardaremos
   * @param comentario el comentario del registro
   */
  async trackerSalidaProductoVenta(
    tx: Prisma.TransactionClient,
    lineas: {
      productoId: number;
      cantidadVendida: number;
      cantidadAnterior: number;
    }[],
    sucursalId: number,
    usuarioId: number,
    ventaID: number,
    tipo: TipoMovimientoStock = TipoMovimientoStock.INGRESO_REQUISICION,
    comentario: string = '',
  ) {
    await Promise.all(
      lineas.map(async (prod) => {
        const cantidadAnterior = prod.cantidadAnterior;
        const cantidadNueva = cantidadAnterior - prod.cantidadVendida;

        await tx.historialStock.create({
          data: {
            producto: { connect: { id: prod.productoId } },
            sucursal: { connect: { id: sucursalId } },
            usuario: { connect: { id: usuarioId } },
            tipo,
            fechaCambio: dayjs().tz('America/Guatemala').toDate(),
            cantidadAnterior,
            cantidadNueva,
            comentario: comentario || `Registro por venta #${ventaID}`,
            venta: { connect: { id: ventaID } },
          },
        });
      }),
    );
  }

  /**
   *
   * @param tx transaccion
   * @param lineas lineas de productos
   * @param sucursalId sucursal donde ocurrio
   * @param usuarioId el usuario que ejecutó la accion
   * @param requisicionId la requisicion principal
   * @param tipo el tipo de registro que guardaremos
   * @param comentario el comentario del registro
   */
  async trackerAjusteStock(
    tx: Prisma.TransactionClient,
    productoId: number,
    sucursalId: number,
    usuarioId: number,
    cantidadAnterior: number,
    cantidadNueva: number,
    ajusteStockID: number,
    comentario: string = '',
  ) {
    await tx.historialStock.create({
      data: {
        producto: { connect: { id: productoId } },
        sucursal: { connect: { id: sucursalId } },
        usuario: { connect: { id: usuarioId } },
        cantidadAnterior,
        cantidadNueva,
        tipo: 'AJUSTE_STOCK',
        comentario:
          comentario || `Registro creado a partir de ajuste #${ajusteStockID}`,
        fechaCambio: dayjs().tz('America/Guatemala').toDate(),
        ajusteStock: { connect: { id: ajusteStockID } },
      },
    });
  }

  /**
   *
   * @param tx
   * @param referenceId
   * @param sucursalId
   * @param userId
   * @param type
   */
  async trackerStockEliminacion(
    tx: Prisma.TransactionClient,
    productoId: number,
    sucursalId: number,
    usuarioId: number,
    cantidadAnterior: number,
    cantidadNueva: number,
    eliminacionStockId: number,
    comentario: string = '',
  ) {
    await tx.historialStock.create({
      data: {
        producto: { connect: { id: productoId } },
        sucursal: { connect: { id: sucursalId } },
        usuario: { connect: { id: usuarioId } },
        tipo: 'ELIMINACION_STOCK',
        fechaCambio: dayjs().tz('America/Guatemala').toDate(),
        cantidadAnterior,
        cantidadNueva,
        comentario,
        eliminacionStock: { connect: { id: eliminacionStockId } },
      },
    });
  }

  /**
   *
   * @param tx
   * @param productos
   * @param sucursalId
   * @param usuarioId
   * @param cantidadAnterior
   * @param cantidadNueva
   * @param ventaEliminadaID
   * @param comentario
   */
  async trackerEliminacionVenta(
    tx: Prisma.TransactionClient,
    productos: {
      productoId: number;
      cantidadEliminada: number;
      cantidadAnterior: number;
      cantidadNueva: number;
    }[],
    sucursalId: number,
    usuarioId: number,
    ventaEliminadaID: number,
    comentario: string = '',
  ) {
    await Promise.all(
      productos.map(async (producto) => {
        await tx.historialStock.create({
          data: {
            producto: { connect: { id: producto.productoId } },
            sucursal: { connect: { id: sucursalId } },
            usuario: { connect: { id: usuarioId } },
            tipo: 'ELIMINACION_VENTA',
            fechaCambio: dayjs().tz('America/Guatemala').toDate(),
            cantidadAnterior: producto.cantidadAnterior,
            cantidadNueva: producto.cantidadNueva,
            comentario,
            eliminacionVenta: { connect: { id: ventaEliminadaID } },
          },
        });
      }),
    );
  }

  /**
   *
   * @param tx
   * @param productoId id del producto transferido
   * @param sucursalId id del sucursal de donde se originó
   * @param usuarioId id del usuario que ejecuta la transaccion
   * @param transferenciaID id de registro de transferencia
   * @param cantidadAnterior la cantidad anterior del stock de donde provino
   * @param cantidadNueva nueva cantidad del stock que quedó
   */
  async transferenciaTracker(
    tx: Prisma.TransactionClient,
    productoId: number,
    sucursalId: number,
    usuarioId: number,
    transferenciaID: number,
    cantidadAnterior: number,
    cantidadNueva: number,
  ) {
    const trackerTransferencia = await tx.historialStock.create({
      data: {
        cantidadAnterior: cantidadAnterior,
        cantidadNueva: cantidadNueva,
        producto: {
          connect: {
            id: productoId,
          },
        },
        usuario: {
          connect: {
            id: usuarioId,
          },
        },
        sucursal: {
          connect: {
            id: sucursalId,
          },
        },
        transferenciaProducto: {
          connect: {
            id: transferenciaID,
          },
        },
        tipo: 'TRANSFERENCIA',
        comentario: `Registro por transferencia de producto No. #${transferenciaID}`,
      },
    });

    console.log('el nuevo registro es: ', trackerTransferencia);
  }

  /**
   *
   * @param tx
   * @param lineas
   * @param sucursalId
   * @param usuarioId
   * @param entregaID
   * @param tipo
   * @param comentario
   */
  async trackeEntregaStock(
    tx: Prisma.TransactionClient,
    lineas: {
      productoId: number;
      cantidadVendida: number;
      cantidadAnterior: number;
    }[],
    sucursalId: number,
    usuarioId: number,
    entregaID: number,
    tipo: TipoMovimientoStock = TipoMovimientoStock.ENTREGA_STOCK,
    comentario: string = '',
  ) {
    await Promise.all(
      lineas.map(async (prod) => {
        const cantidadNueva = prod.cantidadAnterior + prod.cantidadVendida;

        await tx.historialStock.create({
          data: {
            producto: { connect: { id: prod.productoId } },
            sucursal: { connect: { id: sucursalId } },
            usuario: { connect: { id: usuarioId } },
            tipo,
            fechaCambio: dayjs().tz('America/Guatemala').toDate(),
            cantidadAnterior: prod.cantidadAnterior,
            cantidadNueva,
            comentario: comentario || `Registro por entrega #${entregaID}`,
            entregaStock: { connect: { id: entregaID } },
          },
        });
      }),
    );
  }

  /**
   *
   * @param tx
   * @param productoId
   * @param sucursalId
   * @param usuarioId
   * @param garantiaId
   * @param tipo
   * @param comentario
   * @param cantidadAnterior
   * @param cantidadVendida
   */
  async trackerGarantia(
    tx: Prisma.TransactionClient,
    productoId: number,
    sucursalId: number,
    usuarioId: number,
    garantiaId: number,
    tipo: TipoMovimientoStock = TipoMovimientoStock.GARANTIA,
    comentario: string = '',
    cantidadAnterior: number,
    cantidadDevuelta: number,
  ) {
    const cantidadNueva = cantidadAnterior + cantidadDevuelta;
    await tx.historialStock.create({
      data: {
        producto: { connect: { id: productoId } },
        sucursal: { connect: { id: sucursalId } },
        usuario: { connect: { id: usuarioId } },
        tipo,
        fechaCambio: dayjs().tz('America/Guatemala').toDate(),
        cantidadAnterior,
        cantidadNueva,
        comentario: comentario || `Garantía #${garantiaId}`,
        garantia: { connect: { id: garantiaId } },
      },
    });
  }
}
