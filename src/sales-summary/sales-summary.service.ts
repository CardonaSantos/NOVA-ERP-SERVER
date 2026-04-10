import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSalesSummaryDto } from './dto/create-sales-summary.dto';
import { UpdateSalesSummaryDto } from './dto/update-sales-summary.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ResumenPeriodo } from '@prisma/client';
import { CreateAutoSummary } from './dto/create-auto.dto';
import { dayjs } from 'src/utils/dayjs';
const ZONA = 'America/Guatemala';

const formattDate = (value: string | Date) => {
  return dayjs(value).tz(ZONA).format('DD-MM-YYYY');
};

@Injectable()
export class SalesSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSalesSummaryDto) {
    const estado: ResumenPeriodo =
      dto.fechaFin && dto.fechaInicio ? ResumenPeriodo.CUSTOM : dto.periodo;

    const inicio = dayjs
      .tz(dto.fechaInicio, 'YYYY-MM-DD', ZONA)
      .startOf('day') // medianoche local Guatemala
      .toDate();

    const fin = dayjs
      .tz(dto.fechaFin, 'YYYY-MM-DD', ZONA)
      .endOf('day') // 23:59:59.999 local Guatemala
      .toDate();

    const productSalesInRange = await this.prisma.venta.findMany({
      where: {
        fechaVenta: {
          gte: inicio,
          lte: fin,
        },
      },
      include: {
        productos: {
          select: {
            id: true,
            cantidad: true,
            precioVenta: true,
            producto: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });

    if (productSalesInRange.length === 0) {
      const errorPayload = {
        code: 'NO_SALES',
        message: `No se encontraron ventas entre ${dto.fechaInicio} y ${dto.fechaFin}`,
      };
      console.log(
        `No se encontraron ventas entre ${formattDate(inicio)} y ${formattDate(fin)}`,
      );
      throw new HttpException(errorPayload, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    interface TopProducto {
      cantidadVendida: number;
      productId: number;
    }
    const acumulado: Record<number, TopProducto> = {};
    for (const venta of productSalesInRange) {
      for (const p of venta.productos) {
        if (!acumulado[p.producto.id]) {
          acumulado[p.producto.id] = {
            productId: p.producto.id,
            cantidadVendida: 0,
          };
        }
        acumulado[p.producto.id].cantidadVendida += p.cantidad;
      }
    }
    const tops = Object.values(acumulado);
    const productoTop = tops.reduce(
      (prev, curr) =>
        curr.cantidadVendida > prev.cantidadVendida ? curr : prev,
      { productId: 0, cantidadVendida: 0 } as TopProducto,
    );

    const totalVentas = productSalesInRange.reduce(
      (sum, v) => sum + v.totalVenta,
      0,
    );
    const totalTransacciones = productSalesInRange.length;
    const unidadesVendidas = productSalesInRange
      .flatMap((v) => v.productos.map((p) => p.cantidad))
      .reduce((sum, c) => sum + c, 0);
    const ticketPromedio =
      totalTransacciones > 0 ? totalVentas / totalTransacciones : 0;

    const summaryData = {
      titulo: dto.titulo,
      observaciones: dto.observaciones,
      periodo: estado,
      fechaInicio: inicio,
      fechaFin: fin,
      totalVentas,
      totalTransacciones,
      unidadesVendidas,
      ticketPromedio,
      productoTopId: productoTop.productId,
      cantidadProductoTop: productoTop.cantidadVendida,
      sucursalId: dto.sucursalId,
      usuarioId: dto.usuarioId,
      detalles: {
        create: productSalesInRange.flatMap((v) =>
          v.productos.map((p) => ({
            productoId: p.producto.id,
            cantidadVendida: p.cantidad,
            montoVenta: p.precioVenta * p.cantidad,
          })),
        ),
      },
    };

    const x = await this.prisma.resumenVenta.create({
      data: summaryData,
      include: { detalles: true },
    });

    console.log('El registro es ', x);

    return x;
  }

  async createSummaryAuto(dto: CreateAutoSummary) {
    console.log('El dto llegando es: ', dto);

    let inicio;
    let fin;

    try {
      switch (dto.periodo) {
        case 'DIARIO':
          const ahoraD = dayjs().tz(ZONA);
          inicio = ahoraD.startOf('day');
          fin = ahoraD.endOf('day');
          break;

        case 'SEMANAL':
          const ahoraS = dayjs().tz(ZONA);
          inicio = ahoraS.startOf('isoWeek');
          fin = ahoraS.endOf('isoWeek');
          break;

        case 'MENSUAL':
          const ahoraM = dayjs().tz(ZONA);
          inicio = ahoraM.startOf('month');
          fin = ahoraM.endOf('month');
          break;

        default:
          throw new Error('Periodo desconocido');
      }

      const productSalesInRange = await this.prisma.venta.findMany({
        where: {
          fechaVenta: {
            gte: inicio,
            lte: fin,
          },
        },
        include: {
          productos: {
            select: {
              id: true,
              cantidad: true,
              precioVenta: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
            },
          },
        },
      });

      if (productSalesInRange.length === 0) {
        const errorPayload = {
          code: 'NO_SALES',
          message: `No se encontraron ventas entre ${formattDate(inicio)} y ${formattDate(fin)}`,
        };
        console.log(`No se encontraron ventas entre ${inicio} y ${fin}`);
        throw new HttpException(errorPayload, HttpStatus.UNPROCESSABLE_ENTITY);
      }

      interface TopProducto {
        cantidadVendida: number;
        productId: number;
      }
      const acumulado: Record<number, TopProducto> = {};
      for (const venta of productSalesInRange) {
        for (const p of venta.productos) {
          if (!acumulado[p.producto.id]) {
            acumulado[p.producto.id] = {
              productId: p.producto.id,
              cantidadVendida: 0,
            };
          }
          acumulado[p.producto.id].cantidadVendida += p.cantidad;
        }
      }
      const tops = Object.values(acumulado);
      const productoTop = tops.reduce(
        (prev, curr) =>
          curr.cantidadVendida > prev.cantidadVendida ? curr : prev,
        { productId: 0, cantidadVendida: 0 } as TopProducto,
      );

      const totalVentas = productSalesInRange.reduce(
        (sum, v) => sum + v.totalVenta,
        0,
      );
      const totalTransacciones = productSalesInRange.length;
      const unidadesVendidas = productSalesInRange
        .flatMap((v) => v.productos.map((p) => p.cantidad))
        .reduce((sum, c) => sum + c, 0);
      const ticketPromedio =
        totalTransacciones > 0 ? totalVentas / totalTransacciones : 0;

      const summaryData = {
        titulo: 'SISTEMA AUTO',
        observaciones: 'Generado por sistema auto',
        periodo: dto.periodo,
        fechaInicio: inicio,
        fechaFin: fin,
        totalVentas,
        totalTransacciones,
        unidadesVendidas,
        ticketPromedio,
        productoTopId: productoTop.productId,
        cantidadProductoTop: productoTop.cantidadVendida,
        sucursalId: dto.sucursalId,
        usuarioId: dto.usuarioId,
        detalles: {
          create: productSalesInRange.flatMap((v) =>
            v.productos.map((p) => ({
              productoId: p.producto.id,
              cantidadVendida: p.cantidad,
              montoVenta: p.precioVenta * p.cantidad,
            })),
          ),
        },
      };

      // ¡AQUÍ añades el await para que, si falla, salte al catch!
      const created = await this.prisma.resumenVenta.create({
        data: summaryData,
        include: { detalles: true },
      });

      console.log('El registro es ', created);
      console.log('El producto top es: ', productoTop);
    } catch (error) {
      console.log(error);
      throw error; // <-- vuelve a lanzar para que NestJS lo transforme
    }
  }

  async findAll() {
    try {
      const summary = await this.prisma.resumenVenta.findMany({
        include: {
          detalles: {
            select: {
              id: true,
              cantidadVendida: true,
              montoVenta: true,
              producto: {
                select: {
                  id: true,
                  codigoProducto: true,
                  nombre: true,
                },
              },
            },
          },
          productoTop: {
            select: {
              id: true,
              codigoProducto: true,
              nombre: true,
              descripcion: true,
              codigoProveedor: true,
            },
          },
          sucursal: {
            select: {
              id: true,
              nombre: true,
              direccion: true,
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
      return summary;
    } catch (error) {
      console.log(error);
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} salesSummary`;
  }

  update(id: number, updateSalesSummaryDto: UpdateSalesSummaryDto) {
    return `This action updates a #${id} salesSummary`;
  }

  async remove(id: number) {
    try {
      console.log('Entrando al eliminacion de registro de resumen: ', id);

      if (!id) {
        throw new NotFoundException('Error al encontrar el registro');
      }

      const regist = await this.prisma.resumenVenta.delete({
        where: {
          id,
        },
      });

      return regist;
    } catch (error) {
      console.log(error);
      return error;
    }
  }
}
