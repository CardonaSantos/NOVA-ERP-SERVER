import { Injectable } from '@nestjs/common';
import { ReportRepository } from '../domain/reports.repository';
import { QueryReport } from '../dto/query';
import * as Exeljs from 'exceljs';
import { PrismaService } from 'src/prisma/prisma.service';
import { EstadoDetalleVenta, Prisma } from '@prisma/client';
import { dayjs } from 'src/utils/dayjs';
import { formattFechaWithMinutes } from 'src/utils/formattFecha';
import { TZGT } from 'src/utils/utils';
import { formattMonedaGT } from 'src/utils/formattMoneda';

@Injectable()
export class PrismaReportsRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ventasUtilidadReport(query: QueryReport): Promise<Buffer> {
    const { fechaFin, fechaInicio } = query;
    const where: Prisma.VentaWhereInput = {};

    if (fechaInicio && fechaFin) {
      where.fechaVenta = {
        gte: dayjs(fechaInicio).tz(TZGT).startOf('day').toDate(),
        lte: dayjs(fechaFin).tz(TZGT).endOf('day').toDate(),
      };
    }

    const ventas = await this.prisma.venta.findMany({
      where,
      select: {
        id: true,
        fechaVenta: true,
        totalVenta: true,
        usuario: {
          select: {
            nombre: true,
          },
        },
        productos: {
          select: {
            cantidad: true,
            precioVenta: true,
            estado: true,
            producto: {
              select: {
                precioCostoActual: true,
                id: true,
                nombre: true,
                codigoProducto: true,
              },
            },
          },
        },
      },
    });

    const workbook = new Exeljs.Workbook();
    const worksheet = workbook.addWorksheet('Utilidad Reporte');

    worksheet.columns = [
      { header: 'ID Venta', key: 'id', width: 15 },
      { header: 'Vendedor', key: 'vendedor', width: 25 },

      { header: 'Fecha Venta', key: 'fecha', width: 25 },
      { header: 'Producto', key: 'producto', width: 25 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Precio Venta', key: 'pventa', width: 15 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Utilidad', key: 'utilidad', width: 15 },
      // RESUMENes
      { header: 'Cantidad Ventas', key: 'cVentas', width: 15 },
      { header: 'Total Ventas', key: 'tVentas', width: 15 },
      { header: 'Total utilidad', key: 'tUtilidad', width: 15 },
    ];

    const cantidadVentas = ventas.length;
    let totalVentas = 0;
    let totalUtilidad = 0;

    for (const venta of ventas) {
      const ventaId = venta.id;
      const fechaVenta = formattFechaWithMinutes(venta.fechaVenta);

      const vendedor = venta.usuario?.nombre ?? 'N/A';

      for (const producto of venta.productos) {
        const precioVenta = producto.precioVenta;
        const cantidad = producto.cantidad;
        const productoNombre = producto.producto.nombre;
        const productoCodigo = producto.producto.codigoProducto;
        const precioCosto = producto.producto.precioCostoActual;

        const utilidad = (precioVenta - precioCosto) * cantidad;
        totalVentas += venta.totalVenta;
        totalUtilidad += utilidad;

        worksheet.addRow({
          id: ventaId,
          vendedor,
          fecha: fechaVenta,
          producto: productoNombre,
          codigo: productoCodigo,
          pventa: precioVenta,
          cantidad: cantidad,
          utilidad: utilidad,
        });
      }
    }

    worksheet.getCell('I2').value = cantidadVentas;
    worksheet.getCell('J2').value = totalVentas;
    worksheet.getCell('K2').value = totalUtilidad;

    const buff = await workbook.xlsx.writeBuffer();
    return Buffer.from(buff);
  }

  async ventasHistorial(query: QueryReport): Promise<Buffer> {
    const {
      fechaFin,
      fechaInicio,
      comprobantes,
      metodosPago,
      montoMin,
      montoMax,
    } = query;

    const where: Prisma.VentaWhereInput = {};

    if (fechaInicio && fechaFin) {
      where.fechaVenta = {
        gte: dayjs(fechaInicio).tz(TZGT).startOf('day').toDate(),
        lte: dayjs(fechaFin).tz(TZGT).endOf('day').toDate(),
      };
    }

    if (metodosPago?.length) {
      where.metodoPago.metodoPago = {
        in: metodosPago,
      };
    }

    if (comprobantes?.length) {
      where.tipoComprobante = {
        in: comprobantes,
      };
    }

    const parsedMontoMin = montoMin ? parseFloat(String(montoMin)) : undefined;
    const parsedMontoMax = montoMax ? parseFloat(String(montoMax)) : undefined;

    if (parsedMontoMin !== undefined || parsedMontoMax !== undefined) {
      where.totalVenta = {
        ...(parsedMontoMin &&
          !isNaN(parsedMontoMin) && { gte: parsedMontoMin }),
        ...(parsedMontoMax &&
          !isNaN(parsedMontoMax) && { lte: parsedMontoMax }),
      };
    }

    const ventas = await this.prisma.venta.findMany({
      where,
      orderBy: [{ sucursal: { nombre: 'asc' } }, { fechaVenta: 'asc' }],
      select: {
        id: true,
        fechaVenta: true,
        totalVenta: true,
        usuario: {
          select: { nombre: true },
        },
        cliente: {
          select: {
            nombre: true,
            apellidos: true,
            telefono: true,
          },
        },
        productos: {
          select: {
            precioVenta: true,
            cantidad: true,
            estado: true,
            producto: {
              select: {
                nombre: true,
                codigoProducto: true,
              },
            },
          },
        },
        metodoPago: {
          select: { metodoPago: true },
        },
        sucursal: {
          select: { id: true, nombre: true },
        },
      },
    });

    const workbook = new Exeljs.Workbook();

    // Agrupar ventas por sucursal
    const porSucursal = ventas.reduce<Record<string, typeof ventas>>(
      (acc, venta) => {
        const key = venta.sucursal?.nombre ?? 'Sin sucursal';
        if (!acc[key]) acc[key] = [];
        acc[key].push(venta);
        return acc;
      },
      {},
    );

    const COLUMNS: Partial<Exeljs.Column>[] = [
      { header: 'ID Venta', key: 'id', width: 10 },
      { header: 'Fecha', key: 'fecha', width: 22 },
      { header: 'Vendedor', key: 'vendedor', width: 22 },
      { header: 'Cliente', key: 'cliente', width: 25 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Producto', key: 'producto', width: 25 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Método pago', key: 'metodo', width: 16 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Precio Venta', key: 'pventa', width: 14 },
      { header: 'Total Venta', key: 'total', width: 14 },
    ];

    for (const [sucursalNombre, ventasSucursal] of Object.entries(
      porSucursal,
    )) {
      const worksheet = workbook.addWorksheet(sucursalNombre);
      worksheet.columns = COLUMNS;

      // Estilo header
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE9ECEF' },
        };
      });

      let totalVentasSucursal = 0;
      let cantidadVentasSucursal = ventasSucursal.length;

      for (const venta of ventasSucursal) {
        const fechaVenta = formattFechaWithMinutes(venta.fechaVenta);
        const vendedor = venta.usuario?.nombre ?? 'N/A';
        const clienteNombre = venta.cliente
          ? `${venta.cliente.nombre} ${venta.cliente.apellidos ?? ''}`.trim()
          : 'CF';
        const telefono = venta.cliente?.telefono ?? '-';
        const metodos = venta.metodoPago;

        totalVentasSucursal += venta.totalVenta;

        for (const producto of venta.productos) {
          worksheet.addRow({
            id: venta.id,
            fecha: fechaVenta,
            vendedor,
            cliente: clienteNombre,
            telefono,
            producto: producto.producto.nombre,
            codigo: producto.producto.codigoProducto,
            metodo: metodos,
            cantidad: producto.cantidad,
            pventa: producto.precioVenta,
            total: venta.totalVenta,
          });
        }
      }

      // Fila de resumen al final del sheet
      worksheet.addRow({});
      const resumen = worksheet.addRow({
        id: 'RESUMEN',
        vendedor: `Ventas: ${cantidadVentasSucursal}`,
        total: totalVentasSucursal,
      });
      resumen.font = { bold: true };
      resumen.getCell('total').numFmt = '"Q"#,##0.00';
    }

    const buff = await workbook.xlsx.writeBuffer();
    return Buffer.from(buff);
  }
}
