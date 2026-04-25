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
import { QueryReportCajas } from '../dto/query-cajas';
import { parseDecimal } from 'src/utils/parseDecimal';

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
            metodo: metodos.metodoPago,
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

  /**
   * REPORTE DE CAJAS
   * @param query
   */
  async reporteCajas(query: QueryReportCajas): Promise<Buffer> {
    const { ids } = query;

    const records = await this.prisma.registroCaja.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        saldoInicial: true,
        saldoFinal: true,
        fechaApertura: true,
        fechaCierre: true,
        creadoEn: true,
        estado: true,
        usuarioInicio: {
          select: {
            id: true,
            nombre: true,
          },
        },
        movimientos: {
          select: {
            id: true,
            motivo: true,
            clasificacion: true,
            creadoEn: true,
            metodoPago: true,
            descripcion: true,
            gastoOperativoTipo: true,
            costoVentaTipo: true,
            deltaCaja: true,
            deltaBanco: true,
            cuentaBancaria: {
              select: {
                id: true,
                banco: true,
                alias: true,
              },
            },
            referencia: true,
          },
        },
        sucursal: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    const workbook = new Exeljs.Workbook();

    const toNum = (value?: any) => {
      const n = parseDecimal(value);
      return Number.isFinite(n) ? n : 0;
    };

    const formatDate = (value?: Date | string | null) =>
      value ? formattFechaWithMinutes(value) : '-';

    const safeSheetName = (name: string) =>
      name
        .replace(/[\\/?*\[\]:]/g, ' ')
        .trim()
        .slice(0, 31);

    const resumenMovimientos = (
      movs: (typeof records)[number]['movimientos'],
    ) => {
      return movs
        .map((m) => {
          const partes = [
            `#${m.id}`,
            m.clasificacion ?? '-',
            m.motivo ?? '-',
            m.metodoPago ?? '-',
            m.cuentaBancaria
              ? `${m.cuentaBancaria.banco} / ${m.cuentaBancaria.alias}`
              : null,
            m.referencia ? `Ref: ${m.referencia}` : null,
            m.descripcion ? m.descripcion : null,
          ].filter(Boolean);

          return partes.join(' | ');
        })
        .join('\n');
    };

    const styleHeader = (ws: Exeljs.Worksheet) => {
      ws.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE9ECEF' },
        };
      });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = {
        from: 'A1',
        to: ws.getRow(1).actualCellCount
          ? ws.getCell(1, ws.getRow(1).actualCellCount).address
          : 'A1',
      };
    };

    const COLUMNS_CAJAS: Partial<Exeljs.Column>[] = [
      { header: 'ID Caja', key: 'id', width: 10 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Fecha Registro', key: 'fechaRegistro', width: 19 },
      { header: 'Usuario', key: 'usuario', width: 22 },
      { header: 'Saldo Inicial', key: 'saldoIn', width: 14 },
      { header: 'Saldo Final', key: 'saldoFin', width: 14 },
      { header: 'F. Apertura', key: 'fApertura', width: 19 },
      { header: 'F. Cierre', key: 'fCierre', width: 19 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Movimientos', key: 'movCount', width: 12 },
      { header: 'Total Ingresos', key: 'ingresos', width: 14 },
      { header: 'Egresos Operativos', key: 'egresosOperativos', width: 16 },
      { header: 'Transferencias Banco', key: 'transferencias', width: 16 },
      { header: 'Saldo Esperado', key: 'saldoEsperado', width: 14 },
      { header: 'Diferencia', key: 'diferencia', width: 12 },
      { header: 'Movimientos Resumen', key: 'movResumen', width: 45 },
    ];

    const COLUMNS_MOVS: Partial<Exeljs.Column>[] = [
      { header: 'ID Caja', key: 'cajaId', width: 10 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Estado Caja', key: 'estadoCaja', width: 14 },
      { header: 'ID Movimiento', key: 'movId', width: 12 },
      { header: 'Fecha', key: 'fecha', width: 19 },
      { header: 'Motivo', key: 'motivo', width: 18 },
      { header: 'Clasificación', key: 'clasificacion', width: 18 },
      { header: 'Método Pago', key: 'metodoPago', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 32 },
      { header: 'Tipo Gasto', key: 'gastoTipo', width: 18 },
      { header: 'Tipo Costo', key: 'costoTipo', width: 18 },
      { header: 'Delta Caja', key: 'deltaCaja', width: 14 },
      { header: 'Delta Banco', key: 'deltaBanco', width: 14 },
      { header: 'Banco', key: 'banco', width: 18 },
      { header: 'Alias Cuenta', key: 'aliasCuenta', width: 18 },
      { header: 'Referencia', key: 'referencia', width: 18 },
    ];

    const porSucursal = records.reduce<Record<string, typeof records>>(
      (acc, caja) => {
        const key = caja.sucursal?.nombre ?? 'Sin sucursal';
        if (!acc[key]) acc[key] = [];
        acc[key].push(caja);
        return acc;
      },
      {},
    );

    const sucursalesOrdenadas = Object.entries(porSucursal).sort(([a], [b]) =>
      a.localeCompare(b, 'es'),
    );

    for (const [sucursalNombre, cajas] of sucursalesOrdenadas) {
      const cajasOrdenadas = [...cajas].sort(
        (a, b) =>
          new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
      );

      const sheetCajas = workbook.addWorksheet(
        safeSheetName(`${sucursalNombre} - Cajas`),
      );
      const sheetMovs = workbook.addWorksheet(
        safeSheetName(`${sucursalNombre} - Movs`),
      );

      sheetCajas.columns = COLUMNS_CAJAS;
      sheetMovs.columns = COLUMNS_MOVS;

      styleHeader(sheetCajas);
      styleHeader(sheetMovs);

      for (const record of cajasOrdenadas) {
        const movimientosOrdenados = [...record.movimientos].sort(
          (a, b) =>
            new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
        );

        const saldoInicial = toNum(record.saldoInicial);
        const saldoFinal = toNum(record.saldoFinal);

        const totalIngresos = movimientosOrdenados.reduce((acc, mov) => {
          const deltaCaja = toNum(mov.deltaCaja);
          return deltaCaja > 0 ? acc + deltaCaja : acc;
        }, 0);

        const egresosOperativos = movimientosOrdenados.reduce((acc, mov) => {
          const deltaCaja = toNum(mov.deltaCaja);
          const deltaBanco = toNum(mov.deltaBanco);
          return deltaCaja < 0 && deltaBanco === 0
            ? acc + Math.abs(deltaCaja)
            : acc;
        }, 0);

        const transferenciasBanco = movimientosOrdenados.reduce((acc, mov) => {
          const deltaBanco = toNum(mov.deltaBanco);
          const deltaCaja = toNum(mov.deltaCaja);
          return deltaBanco !== 0 ? acc + Math.abs(deltaCaja) : acc;
        }, 0);

        const saldoEsperado =
          saldoInicial +
          totalIngresos -
          egresosOperativos -
          transferenciasBanco;

        const diferencia = saldoFinal - saldoEsperado;

        sheetCajas.addRow({
          id: record.id,
          sucursal: record.sucursal?.nombre ?? 'Sin sucursal',
          fechaRegistro: formatDate(record.creadoEn),
          usuario: record.usuarioInicio?.nombre ?? 'N/A',
          saldoIn: saldoInicial,
          saldoFin: saldoFinal,
          fApertura: formatDate(record.fechaApertura),
          fCierre: formatDate(record.fechaCierre),
          estado: record.estado ?? '-',
          movCount: movimientosOrdenados.length,
          ingresos: totalIngresos,
          egresosOperativos,
          transferencias: transferenciasBanco,
          saldoEsperado,
          diferencia,
          movResumen: resumenMovimientos(movimientosOrdenados),
        });

        for (const mov of movimientosOrdenados) {
          sheetMovs.addRow({
            cajaId: record.id,
            sucursal: record.sucursal?.nombre ?? 'Sin sucursal',
            estadoCaja: record.estado ?? '-',
            movId: mov.id,
            fecha: mov.creadoEn ? new Date(mov.creadoEn) : null,
            motivo: mov.motivo ?? '-',
            clasificacion: mov.clasificacion ?? '-',
            metodoPago: mov.metodoPago ?? '-',
            descripcion: mov.descripcion ?? '-',
            gastoTipo: mov.gastoOperativoTipo ?? '-',
            costoTipo: mov.costoVentaTipo ?? '-',
            deltaCaja: toNum(mov.deltaCaja),
            deltaBanco: toNum(mov.deltaBanco),
            banco: mov.cuentaBancaria?.banco ?? '-',
            aliasCuenta: mov.cuentaBancaria?.alias ?? '-',
            referencia: mov.referencia ?? '-',
          });
        }
      }

      sheetCajas.getColumn('saldoIn').numFmt = '"Q"#,##0.00';
      sheetCajas.getColumn('saldoFin').numFmt = '"Q"#,##0.00';
      sheetCajas.getColumn('ingresos').numFmt = '"Q"#,##0.00';
      sheetCajas.getColumn('egresosOperativos').numFmt = '"Q"#,##0.00';
      sheetCajas.getColumn('transferencias').numFmt = '"Q"#,##0.00';
      sheetCajas.getColumn('saldoEsperado').numFmt = '"Q"#,##0.00';
      sheetCajas.getColumn('diferencia').numFmt = '"Q"#,##0.00';

      sheetMovs.getColumn('fecha').numFmt = 'dd/mm/yyyy hh:mm';
      sheetMovs.getColumn('deltaCaja').numFmt = '"Q"#,##0.00';
      sheetMovs.getColumn('deltaBanco').numFmt = '"Q"#,##0.00';

      sheetCajas.getColumn('movResumen').alignment = {
        wrapText: true,
        vertical: 'top',
      };
      sheetMovs.getColumn('descripcion').alignment = {
        wrapText: true,
        vertical: 'top',
      };

      sheetCajas.addRow({});
      const resumen = sheetCajas.addRow({
        id: 'RESUMEN',
        sucursal: `Cajas: ${cajasOrdenadas.length}`,
      });
      resumen.font = { bold: true };
    }

    const buff = await workbook.xlsx.writeBuffer();
    return Buffer.from(buff);
  }

  // CONTABILIDAD

  private createWorkbook(name: string) {
    const wb = new Exeljs.Workbook();
    const ws = wb.addWorksheet(name);

    ws.getRow(1).font = { bold: true };

    return { wb, ws };
  }

  private async toBuffer(wb: Exeljs.Workbook): Promise<Buffer> {
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async libroDiario(query: QueryReport): Promise<Buffer> {
    const records = await this.prisma.asientoContable.findMany({
      include: { lineas: { include: { cuentaContable: true } } },
      orderBy: { fecha: 'asc' },
    });

    const wb = new Exeljs.Workbook();
    const ws = wb.addWorksheet('Libro Diario');

    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Descripción', key: 'descripcion', width: 30 },
      { header: 'Cuenta', key: 'cuenta', width: 30 },
      { header: 'Debe', key: 'debe', width: 15 },
      { header: 'Haber', key: 'haber', width: 15 },
    ];

    records.forEach((asiento) => {
      asiento.lineas.forEach((l) => {
        ws.addRow({
          fecha: asiento.fecha.toISOString().split('T')[0],
          descripcion: asiento.descripcion,
          cuenta: `${l.cuentaContable.codigo} ${l.cuentaContable.nombre}`,
          debe: Number(l.debe),
          haber: Number(l.haber),
        });
      });
    });

    // return wb.xlsx.writeBuffer();
    return this.toBuffer(wb);
  }

  async libroMayor(query: QueryReport): Promise<Buffer> {
    const lineas = await this.prisma.asientoContableLinea.findMany({
      include: {
        cuentaContable: true,
        asientoContable: true,
      },
    });

    const wb = new Exeljs.Workbook();
    const ws = wb.addWorksheet('Mayor');

    ws.columns = [
      { header: 'Cuenta', key: 'cuenta', width: 30 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Debe', key: 'debe', width: 15 },
      { header: 'Haber', key: 'haber', width: 15 },
    ];

    lineas.forEach((l) => {
      ws.addRow({
        cuenta: l.cuentaContable.nombre,
        fecha: l.asientoContable.fecha.toISOString().split('T')[0],
        debe: Number(l.debe),
        haber: Number(l.haber),
      });
    });

    // return wb.xlsx.writeBuffer();
    return this.toBuffer(wb);
  }

  async balanceComprobacion(query: QueryReport): Promise<Buffer> {
    const cuentas = await this.prisma.cuentaContable.findMany({
      include: { lineas: true },
    });

    const wb = new Exeljs.Workbook();
    const ws = wb.addWorksheet('Balance');

    ws.columns = [
      { header: 'Cuenta', key: 'cuenta', width: 30 },
      { header: 'Debe', key: 'debe', width: 15 },
      { header: 'Haber', key: 'haber', width: 15 },
    ];

    cuentas.forEach((c) => {
      const debe = c.lineas.reduce((a, b) => a + Number(b.debe), 0);
      const haber = c.lineas.reduce((a, b) => a + Number(b.haber), 0);

      ws.addRow({
        cuenta: c.nombre,
        debe,
        haber,
      });
    });

    // return wb.xlsx.writeBuffer();

    return this.toBuffer(wb);
  }

  async estadoResultados(query: QueryReport): Promise<Buffer> {
    const cuentas = await this.prisma.cuentaContable.findMany({
      include: { lineas: true },
    });

    let ingresos = 0;
    let costos = 0;
    let gastos = 0;

    cuentas.forEach((c) => {
      const total = c.lineas.reduce(
        (a, b) => a + Number(b.haber) - Number(b.debe),
        0,
      );

      if (c.tipo === 'INGRESO') ingresos += total;
      if (c.tipo === 'COSTO') costos += total;
      if (c.tipo === 'GASTO') gastos += total;
    });

    const wb = new Exeljs.Workbook();
    const ws = wb.addWorksheet('Resultados');

    ws.addRow(['Ingresos', ingresos]);
    ws.addRow(['Costos', costos]);
    ws.addRow(['Gastos', gastos]);
    ws.addRow([]);
    ws.addRow(['Utilidad', ingresos - costos - gastos]);

    // return await wb.xlsx.writeBuffer();
    return this.toBuffer(wb);
  }
}
