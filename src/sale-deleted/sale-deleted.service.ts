import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateSaleDeletedDto } from './dto/create-sale-deleted.dto';
import { UpdateSaleDeletedDto } from './dto/update-sale-deleted.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { HistorialStockTrackerService } from 'src/historial-stock-tracker/historial-stock-tracker.service';
import { dayjs } from 'src/utils/dayjs';
import { TZGT } from 'src/utils/utils';

//------>
@Injectable()
export class SaleDeletedService {
  private readonly logger = new Logger(SaleDeletedService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracker: HistorialStockTrackerService,
  ) {}

  async create(createSaleDeletedDto: CreateSaleDeletedDto) {
    const {
      usuarioId,
      motivo,
      totalVenta,
      clienteId,
      productos,
      adminPassword,
      sucursalId,
      ventaId,
    } = createSaleDeletedDto;

    this.logger.log(
      `DTO recibido para eliminación de venta:\n${JSON.stringify(
        createSaleDeletedDto,
        null,
        2,
      )}`,
    );

    return this.prisma.$transaction(async (tx) => {
      // === 1️⃣ VALIDAR ADMIN ===
      const usuarioAdmin = await tx.usuario.findUnique({
        where: { id: usuarioId },
      });

      if (
        !usuarioAdmin ||
        !(await bcrypt.compare(adminPassword, usuarioAdmin.contrasena))
      ) {
        throw new UnauthorizedException(
          'Credenciales de administrador incorrectas.',
        );
      }

      // === 2️⃣ CREAR REGISTRO DE VENTA ELIMINADA ===
      const clienteIdFinal = clienteId && clienteId > 0 ? clienteId : null;
      const ventaEliminada = await tx.ventaEliminada.create({
        data: {
          usuarioId,
          motivo,
          totalVenta,
          clienteId: clienteIdFinal,
          sucursalId,
        },
      });

      if (!ventaEliminada?.id) {
        throw new InternalServerErrorException(
          'No se pudo crear venta eliminada',
        );
      }

      // === 3️⃣ ANULAR LA VENTA ORIGINAL ===
      await tx.venta.update({
        where: { id: ventaId },
        data: {
          anulada: true,
          anuladaPor: { connect: { id: usuarioId } },
          fechaAnulacion: dayjs().tz(TZGT).toDate(),
          motivoAnulacion: motivo,
        },
      });

      // === 4️⃣ SEPARAR PRODUCTOS Y PRESENTACIONES ===
      const productosSimples = productos.filter((p) => p.type === 'PRODUCTO');
      const presentaciones = productos.filter((p) => p.type === 'PRESENTACION');
      const presentacionIds = presentaciones
        .map((p) => p.productoId)
        .filter((id): id is number => !!id);

      const presentacionesWithProdIds = await tx.productoPresentacion.findMany({
        where: { id: { in: presentacionIds } },
        include: { producto: true },
      });

      const presentacionesWithProduct = presentaciones.map((pres) => {
        const dataDb = presentacionesWithProdIds.find(
          (db) => db.id === pres.productoId,
        );
        if (!dataDb)
          throw new BadRequestException(
            `Presentación con id ${pres.productoId} no encontrada.`,
          );

        return {
          presentacionId: dataDb.id,
          productoId: dataDb.productoId,
          cantidad: pres.cantidad,
          precioVenta: pres.precioVenta,
        };
      });

      // === 5️⃣ RESTAURAR STOCKS ===
      const productosParaTracker: any[] = [];

      // 🔹 PRODUCTOS
      for (const prod of productosSimples) {
        if (!prod.productoId)
          throw new BadRequestException(
            `Producto inválido: ${prod.productoId}`,
          );

        const agg = await tx.stock.aggregate({
          _sum: { cantidad: true },
          where: { productoId: prod.productoId, sucursalId },
        });
        const cantidadAnterior = agg._sum.cantidad ?? 0;

        const lote = await tx.stock.findFirst({
          where: { productoId: prod.productoId, sucursalId },
          orderBy: { fechaIngreso: 'asc' },
        });

        if (lote) {
          await tx.stock.update({
            where: { id: lote.id },
            data: { cantidad: { increment: prod.cantidad } },
          });
        } else {
          await tx.stock.create({
            data: {
              productoId: prod.productoId,
              cantidad: prod.cantidad,
              costoTotal: 0,
              fechaIngreso: new Date(),
              precioCosto: 0,
              sucursalId,
            },
          });
        }

        productosParaTracker.push({
          tipo: 'PRODUCTO',
          productoId: prod.productoId,
          cantidadEliminada: prod.cantidad,
          cantidadAnterior,
          cantidadNueva: cantidadAnterior + prod.cantidad,
        });
      }

      // 🔹 PRESENTACIONES
      for (const pres of presentacionesWithProduct) {
        const agg = await tx.stockPresentacion.aggregate({
          _sum: { cantidadPresentacion: true },
          where: { presentacionId: pres.presentacionId, sucursalId },
        });
        const cantidadAnterior = agg._sum.cantidadPresentacion ?? 0;

        const lote = await tx.stockPresentacion.findFirst({
          where: { presentacionId: pres.presentacionId, sucursalId },
          orderBy: { fechaIngreso: 'asc' },
        });

        if (lote) {
          await tx.stockPresentacion.update({
            where: { id: lote.id },
            data: { cantidadPresentacion: { increment: pres.cantidad } },
          });
        } else {
          await tx.stockPresentacion.create({
            data: {
              productoId: pres.productoId,
              presentacionId: pres.presentacionId,
              cantidadRecibidaInicial: pres.cantidad,
              cantidadPresentacion: pres.cantidad,
              fechaIngreso: dayjs().tz(TZGT).toDate(),
              sucursalId,
            },
          });
        }

        productosParaTracker.push({
          tipo: 'PRESENTACION',
          productoId: pres.productoId,
          presentacionId: pres.presentacionId,
          cantidadEliminada: pres.cantidad,
          cantidadAnterior,
          cantidadNueva: cantidadAnterior + pres.cantidad,
        });
      }

      // === 6️⃣ TRACKER DE MOVIMIENTOS ===
      await this.tracker.trackerEliminacionVenta(
        tx,
        productosParaTracker,
        sucursalId,
        usuarioId,
        ventaEliminada.id,
        motivo ?? 'Venta eliminada',
      );

      return ventaEliminada;
    });
  }

  findAll() {
    return `This action returns all saleDeleted`;
  }

  async findMySalesDeleted(sucursalId: number) {
    try {
      const regists = await this.prisma.ventaEliminada.findMany({
        orderBy: {
          fechaEliminacion: 'desc',
        },
        where: {
          sucursalId,
        },
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              telefono: true,
              dpi: true,
              direccion: true,
            },
          },
          VentaEliminadaProducto: {
            select: {
              id: true,
              cantidad: true,
              precioVenta: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  codigoProducto: true,
                },
              },
            },
          },
          usuario: {
            select: {
              id: true,
              nombre: true,
              rol: true,
            },
          },
        },
      });
      return regists;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error');
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} saleDeleted`;
  }

  update(id: number, updateSaleDeletedDto: UpdateSaleDeletedDto) {
    return `This action updates a #${id} saleDeleted`;
  }

  async removeAll() {
    try {
      const regists = await this.prisma.ventaEliminada.deleteMany({});
      return regists;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error');
    }
  }

  remove(id: number) {
    return `This action removes a #${id} saleDeleted`;
  }
}
