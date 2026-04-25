import { Injectable, Logger } from '@nestjs/common';
import {
  QueryBalanceComprobacion,
  QueryEstadoBancario,
  QueryEstadoCajaTurno,
  QueryEstadoCuentaCliente,
  QueryEstadoCuentaContable,
  QueryEstadoCuentaProveedor,
  QueryEstadoResultados,
  QueryFlujoCaja,
  QueryLibroDiario,
  QueryLibroMayor,
  QueryMovimientosSinAsiento,
  QueryReporteGastos,
  QueryReporteReglasContables,
  QueryReporteVentas,
  ReportRepository,
} from '../domain/reports.repository';
import { QueryReport } from '../dto/query';
import * as Exeljs from 'exceljs';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ClasificacionAdmin,
  EstadoAsientoContable,
  EstadoDetalleVenta,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
  Prisma,
} from '@prisma/client';
import { dayjs } from 'src/utils/dayjs';
import { formattFechaWithMinutes } from 'src/utils/formattFecha';
import { TZGT } from 'src/utils/utils';
import { formattMonedaGT } from 'src/utils/formattMoneda';
import { QueryReportCajas } from '../dto/query-cajas';
import { parseDecimal } from 'src/utils/parseDecimal';
import { ExcelReportFactory } from '../excel-report-factory';
import { toNumber } from '../utils';

function baseWhereDate(fechaInicio?: Date, fechaFin?: Date) {
  const where: { gte?: Date; lte?: Date } = {};
  if (fechaInicio) where.gte = fechaInicio;
  if (fechaFin) where.lte = fechaFin;
  return Object.keys(where).length ? where : undefined;
}

@Injectable()
export class PrismaReportsRepository implements ReportRepository {
  private readonly logger = new Logger(PrismaReportsRepository.name);
  private readonly excel = new ExcelReportFactory();
  private baseWorkbook(title: string, subtitle?: string) {
    const wb = this.excel.createWorkbook();
    const sh = this.excel.createSheet(wb, title, { title, subtitle });
    return { wb, sh };
  }

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

  private async fetchAllForLibro(query: QueryLibroDiario) {
    const fechaInicio = query.fechaInicio
      ? new Date(query.fechaInicio)
      : undefined;
    const fechaFin = query.fechaFin ? new Date(query.fechaFin) : undefined;

    const where: Prisma.AsientoContableWhereInput = {
      ...(fechaInicio || fechaFin
        ? {
            fecha: {
              ...(fechaInicio ? { gte: fechaInicio } : {}),
              ...(fechaFin ? { lte: fechaFin } : {}),
            },
          }
        : {}),

      ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
      ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),
      ...(query.origen ? { origen: query.origen } : {}),

      ...(query.estado
        ? { estado: query.estado }
        : { estado: { not: EstadoAsientoContable.BORRADOR } }),

      ...(query.search
        ? {
            OR: [
              {
                descripcion: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                referencia: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    return this.prisma.asientoContable.findMany({
      where,
      include: {
        sucursal: {
          select: { id: true, nombre: true },
        },
        usuario: {
          select: { id: true, nombre: true },
        },
        lineas: {
          include: {
            cuentaContable: {
              select: {
                id: true,
                codigo: true,
                nombre: true,
                tipo: true,
                naturaleza: true,
              },
            },
          },
        },
      },
      orderBy: { fecha: 'asc' },
    });
  }

  async reporteLibroDiario(query: QueryLibroDiario): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook(
      'Libro Diario',
      'Asientos y líneas contables',
    );

    const records = await this.fetchAllForLibro(query);

    const startRow = 4;

    // 🔹 HEADERS MANUALES (NO usar header en columns)
    const columns = [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Asiento', key: 'asiento', width: 12 },
      { header: 'Origen', key: 'origen', width: 18 },
      { header: 'OrigenId', key: 'origenId', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 34 },
      // { header: 'Referencia', key: 'referencia', width: 18 },
      // { header: 'Sucursal', key: 'sucursal', width: 20 },
      // { header: 'Usuario', key: 'usuario', width: 18 },
      { header: 'Cuenta', key: 'cuenta', width: 28 },
      { header: 'Debe', key: 'debe', width: 14 },
      { header: 'Haber', key: 'haber', width: 14 },
      { header: 'Total Debe', key: 'totalDebe', width: 14 },
      { header: 'Total Haber', key: 'totalHaber', width: 14 },
      { header: 'Estado', key: 'estado', width: 14 },
    ];

    // 🔹 SOLO KEYS Y WIDTH (SIN header)
    sh.columns = columns.map((c) => ({
      key: c.key,
      width: c.width,
    }));

    // 🔹 HEADER EN FILA 4
    const headerRow = sh.getRow(startRow);
    columns.forEach((col, i) => {
      headerRow.getCell(i + 1).value = col.header;
    });

    // 🔹 DATA
    let row = startRow + 1;
    let totalDebe = 0;
    let totalHaber = 0;

    for (const asiento of records) {
      for (const linea of asiento.lineas) {
        this.logger.log(
          `EL ASIENTO A MAPEA Y CON SUS PROPS ES:\n${JSON.stringify(asiento, null, 2)}`,
        );
        const debe = toNumber(linea.debe);
        const haber = toNumber(linea.haber);

        totalDebe += debe;
        totalHaber += haber;

        sh.insertRow(row++, {
          fecha: new Date(asiento.fecha),
          asiento: asiento.id,
          origen: asiento.origen ?? '',
          origenId: asiento.origenId ?? '',
          descripcion: asiento.descripcion ?? '',
          // referencia: asiento.referencia ?? '',
          // sucursal: asiento.sucursal?.nombre ?? '',
          // usuario: asiento.usuario?.nombre ?? '',
          cuenta: linea.cuentaContable
            ? `${linea.cuentaContable.codigo} - ${linea.cuentaContable.nombre}`
            : '',
          debe,
          haber,
          totalDebe: toNumber(asiento.totalDebe),
          totalHaber: toNumber(asiento.totalHaber),
          estado: asiento.estado ?? '',
        });
      }
    }

    // 🔹 TOTALES
    sh.insertRow(row, {
      fecha: 'TOTALES',
      debe: totalDebe,
      haber: totalHaber,
    });

    // 🔹 FORMATOS
    this.excel.moneyFormat(sh, ['debe', 'haber', 'totalDebe', 'totalHaber']);
    this.excel.dateTimeFormat(sh, ['fecha']);

    this.excel.finalizeSheet(sh, startRow);

    return this.excel.toBuffer(wb);
  }

  async reporteLibroMayorPorCuenta(query: QueryLibroMayor): Promise<Buffer> {
    const { wb } = this.baseWorkbook('Libro Mayor por Cuenta');
    const cuentas = await this.prisma.cuentaContable.findMany({
      where: { id: query.cuentaContableId, activa: true },
      include: {
        lineas: {
          include: {
            asientoContable: { include: { sucursal: true } },
            cuentaContable: true,
          },
          orderBy: { asientoContable: { fecha: 'asc' } },
        },
      },
    });

    for (const cuenta of cuentas) {
      const sheet = wb.addWorksheet(cuenta.codigo.slice(0, 31));
      this.excel.setColumns(sheet, [
        { header: 'Cuenta', key: 'cuenta', width: 28 },
        { header: 'Fecha', key: 'fecha', width: 18 },
        { header: 'Asiento', key: 'asiento', width: 12 },
        { header: 'Descripción', key: 'descripcion', width: 32 },
        { header: 'Origen', key: 'origen', width: 18 },
        { header: 'Debe', key: 'debe', width: 14 },
        { header: 'Haber', key: 'haber', width: 14 },
        { header: 'Saldo acumulado', key: 'saldo', width: 16 },
      ]);

      let saldo = 0;
      for (const linea of cuenta.lineas) {
        const debe = toNumber(linea.debe);
        const haber = toNumber(linea.haber);
        saldo += debe - haber;
        sheet.addRow({
          cuenta: `${cuenta.codigo} - ${cuenta.nombre}`,
          fecha: new Date(linea.asientoContable.fecha),
          asiento: linea.asientoContable.id,
          descripcion: linea.asientoContable.descripcion ?? '',
          origen: linea.asientoContable.origen ?? '',
          debe,
          haber,
          saldo,
        });
      }

      this.excel.moneyFormat(sheet, ['debe', 'haber', 'saldo']);
      this.excel.dateTimeFormat(sheet, ['fecha']);
      this.excel.finalizeSheet(sheet, 4);
    }

    return this.excel.toBuffer(wb);
  }

  async reporteBalanceComprobacion(
    query: QueryBalanceComprobacion,
  ): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Balance de Comprobación');
    const cuentas = await this.prisma.cuentaContable.findMany({
      where: {
        activa: true,
        ...(query.cuentaContableId ? { id: query.cuentaContableId } : {}),
      },
      include: {
        lineas: {
          where: {
            asientoContable: {
              fecha: baseWhereDate(query.fechaInicio, query.fechaFin),
              estado: query.estado ? query.estado : { not: 'BORRADOR' },
            },
          },
          select: { debe: true, haber: true },
        },
      },
      orderBy: { codigo: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Tipo', key: 'tipo', width: 16 },
      { header: 'Naturaleza', key: 'naturaleza', width: 14 },
      { header: 'Nivel', key: 'nivel', width: 10 },
      { header: 'Debe acumulado', key: 'debe', width: 16 },
      { header: 'Haber acumulado', key: 'haber', width: 16 },
      { header: 'Saldo', key: 'saldo', width: 16 },
      { header: 'Movimiento permitido', key: 'permiteMovimiento', width: 18 },
      { header: 'Activa', key: 'activa', width: 10 },
    ]);

    let sumDebe = 0;
    let sumHaber = 0;
    for (const cuenta of cuentas) {
      const debe = cuenta.lineas.reduce((acc, l) => acc + toNumber(l.debe), 0);
      const haber = cuenta.lineas.reduce(
        (acc, l) => acc + toNumber(l.haber),
        0,
      );
      sumDebe += debe;
      sumHaber += haber;
      sh.addRow({
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        naturaleza: cuenta.naturaleza,
        nivel: cuenta.nivel,
        debe,
        haber,
        saldo: debe - haber,
        permiteMovimiento: cuenta.permiteMovimiento ? 'Sí' : 'No',
        activa: cuenta.activa ? 'Sí' : 'No',
      });
    }

    const total = sh.addRow({
      codigo: 'TOTALES',
      debe: sumDebe,
      haber: sumHaber,
      saldo: sumDebe - sumHaber,
    });
    total.font = { bold: true };

    this.excel.moneyFormat(sh, ['debe', 'haber', 'saldo']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteEstadoResultados(query: QueryEstadoResultados): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Estado de Resultados');
    const cuentas = await this.prisma.cuentaContable.findMany({
      where: { activa: true },
      include: {
        lineas: {
          where: {
            asientoContable: {
              fecha: baseWhereDate(query.fechaInicio, query.fechaFin),
              estado: query.estado ? query.estado : { not: 'BORRADOR' },
            },
          },
          select: { debe: true, haber: true },
        },
      },
    });

    const ingresos = cuentas
      .filter((c) => c.tipo === 'INGRESO')
      .reduce(
        (acc, c) =>
          acc +
          c.lineas.reduce(
            (s, l) => s + toNumber(l.haber) - toNumber(l.debe),
            0,
          ),
        0,
      );
    const costos = cuentas
      .filter((c) => c.tipo === 'COSTO')
      .reduce(
        (acc, c) =>
          acc +
          c.lineas.reduce(
            (s, l) => s + toNumber(l.debe) - toNumber(l.haber),
            0,
          ),
        0,
      );
    const gastos = cuentas
      .filter((c) => c.tipo === 'GASTO')
      .reduce(
        (acc, c) =>
          acc +
          c.lineas.reduce(
            (s, l) => s + toNumber(l.debe) - toNumber(l.haber),
            0,
          ),
        0,
      );
    const utilidadBruta = ingresos - costos;
    const utilidadOperativa = utilidadBruta - gastos;
    const utilidadNeta = utilidadOperativa;

    this.excel.setColumns(sh, [
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Monto', key: 'monto', width: 18 },
    ]);

    sh.addRows([
      { concepto: 'Ingresos', monto: ingresos },
      { concepto: 'Costos', monto: costos },
      { concepto: 'Utilidad bruta', monto: utilidadBruta },
      { concepto: 'Gastos operativos', monto: gastos },
      { concepto: 'Utilidad operativa', monto: utilidadOperativa },
      { concepto: 'Utilidad neta', monto: utilidadNeta },
    ]);

    this.excel.moneyFormat(sh, ['monto']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteFlujoCaja(query: QueryFlujoCaja): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Flujo de Caja / Movimientos de Caja');

    const fechaInicio = query.fechaInicio
      ? new Date(query.fechaInicio)
      : undefined;
    const fechaFin = query.fechaFin ? new Date(query.fechaFin) : undefined;

    const where: Prisma.MovimientoFinancieroWhereInput = {
      ...(fechaInicio || fechaFin
        ? {
            fecha: {
              ...(fechaInicio ? { gte: fechaInicio } : {}),
              ...(fechaFin ? { lte: fechaFin } : {}),
            },
          }
        : {}),

      ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
      ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),
      ...(query.registroCajaId ? { registroCajaId: query.registroCajaId } : {}),
      ...(query.cuentaBancariaId
        ? { cuentaBancariaId: query.cuentaBancariaId }
        : {}),

      // ✅ ENUMS → igualdad directa
      ...(query.motivo ? { motivo: query.motivo } : {}),
      ...(query.clasificacion ? { clasificacion: query.clasificacion } : {}),
      ...(query.metodoPago ? { metodoPago: query.metodoPago } : {}),

      // ✅ TEXTO libre → contains
      ...(query.search
        ? {
            OR: [
              { descripcion: { contains: query.search, mode: 'insensitive' } },
              { referencia: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const records = await this.prisma.movimientoFinanciero.findMany({
      where: where,
      include: {
        sucursal: true,
        registroCaja: true,
        cuentaBancaria: true,
        proveedor: true,
        usuario: true,
      },
      orderBy: { fecha: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Caja / Turno', key: 'caja', width: 16 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Usuario', key: 'usuario', width: 18 },
      { header: 'Motivo', key: 'motivo', width: 18 },
      { header: 'Clasificación', key: 'clasificacion', width: 18 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 30 },
      { header: 'Referencia', key: 'referencia', width: 16 },
      { header: 'Entrada caja', key: 'entradaCaja', width: 14 },
      { header: 'Salida caja', key: 'salidaCaja', width: 14 },
      { header: 'Entrada banco', key: 'entradaBanco', width: 14 },
      { header: 'Salida banco', key: 'salidaBanco', width: 14 },
      { header: 'Cuenta bancaria', key: 'cuentaBancaria', width: 24 },
      { header: 'Proveedor', key: 'proveedor', width: 24 },
      { header: 'Depósito cierre', key: 'cierre', width: 14 },
      { header: 'Depósito proveedor', key: 'depProv', width: 14 },
    ]);

    for (const mov of records) {
      const deltaCaja = toNumber(mov.deltaCaja);
      const deltaBanco = toNumber(mov.deltaBanco);
      sh.addRow({
        fecha: new Date(mov.fecha),
        caja: mov.registroCajaId ?? '',
        sucursal: mov.sucursal?.nombre ?? '',
        usuario: mov.usuario?.nombre ?? '',
        motivo: mov.motivo ?? '',
        clasificacion: mov.clasificacion ?? '',
        metodoPago: mov.metodoPago ?? '',
        descripcion: mov.descripcion ?? '',
        referencia: mov.referencia ?? '',
        entradaCaja: deltaCaja > 0 ? deltaCaja : 0,
        salidaCaja: deltaCaja < 0 ? Math.abs(deltaCaja) : 0,
        entradaBanco: deltaBanco > 0 ? deltaBanco : 0,
        salidaBanco: deltaBanco < 0 ? Math.abs(deltaBanco) : 0,
        cuentaBancaria: mov.cuentaBancaria
          ? `${mov.cuentaBancaria.banco} - ${mov.cuentaBancaria.alias ?? ''}`
          : '',
        proveedor: mov.proveedor?.nombre ?? '',
        cierre: mov.esDepositoCierre ? 'Sí' : 'No',
        depProv: mov.esDepositoProveedor ? 'Sí' : 'No',
      });
    }

    this.excel.moneyFormat(sh, [
      'entradaCaja',
      'salidaCaja',
      'entradaBanco',
      'salidaBanco',
    ]);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteEstadoCajaTurno(query: QueryEstadoCajaTurno): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Estado de Caja por Turno');
    const cajas = await this.prisma.registroCaja.findMany({
      where: {
        fechaApertura: baseWhereDate(query.fechaInicio, query.fechaFin),
        sucursalId: query.sucursalId,
        estado: query.estado,
      },
      include: {
        sucursal: true,
        usuarioInicio: true,
        usuarioCierre: true,
        movimientos: true,
      },
      orderBy: { fechaApertura: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Apertura', key: 'apertura', width: 18 },
      { header: 'Cierre', key: 'cierre', width: 18 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Usuario apertura', key: 'usuarioInicio', width: 18 },
      { header: 'Usuario cierre', key: 'usuarioCierre', width: 18 },
      { header: 'Saldo inicial', key: 'saldoInicial', width: 14 },
      { header: 'Ingresos', key: 'ingresos', width: 14 },
      { header: 'Egresos', key: 'egresos', width: 14 },
      { header: 'Saldo final', key: 'saldoFinal', width: 14 },
      { header: 'Fondo fijo', key: 'fondoFijo', width: 14 },
      { header: 'Depositado', key: 'depositado', width: 14 },
      { header: 'Diferencia', key: 'diferencia', width: 14 },
    ]);

    for (const caja of cajas) {
      const ingresos = caja.movimientos.reduce(
        (a, m) => a + (toNumber(m.deltaCaja) > 0 ? toNumber(m.deltaCaja) : 0),
        0,
      );
      const egresos = caja.movimientos.reduce(
        (a, m) =>
          a + (toNumber(m.deltaCaja) < 0 ? Math.abs(toNumber(m.deltaCaja)) : 0),
        0,
      );
      const saldoFinal = toNumber(caja.saldoInicial) + ingresos - egresos;
      sh.addRow({
        apertura: caja.fechaApertura ?? null,
        cierre: caja.fechaCierre ?? null,
        sucursal: caja.sucursal?.nombre ?? '',
        usuarioInicio: caja.usuarioInicio?.nombre ?? '',
        usuarioCierre: caja.usuarioCierre?.nombre ?? '',
        saldoInicial: toNumber(caja.saldoInicial),
        ingresos,
        egresos,
        saldoFinal,
        fondoFijo: toNumber(caja.fondoFijo),
        depositado: caja.depositado ? 'Sí' : 'No',
        diferencia: saldoFinal - toNumber(caja.fondoFijo),
      });
    }

    this.excel.moneyFormat(sh, [
      'saldoInicial',
      'ingresos',
      'egresos',
      'saldoFinal',
      'fondoFijo',
      'diferencia',
    ]);
    this.excel.dateTimeFormat(sh, ['apertura', 'cierre']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteEstadoCuentaContable(
    query: QueryEstadoCuentaContable,
  ): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Estado de Cuenta Contable');
    const cuenta = await this.prisma.cuentaContable.findUnique({
      where: { id: query.cuentaContableId },
      include: {
        lineas: {
          where: {
            asientoContable: {
              fecha: baseWhereDate(query.fechaInicio, query.fechaFin),
            },
          },
          include: { asientoContable: true },
          orderBy: { asientoContable: { fecha: 'asc' } },
        },
      },
    });

    this.excel.setColumns(sh, [
      { header: 'Cuenta', key: 'cuenta', width: 30 },
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Asiento', key: 'asiento', width: 12 },
      { header: 'Descripción', key: 'descripcion', width: 32 },
      { header: 'Debe', key: 'debe', width: 14 },
      { header: 'Haber', key: 'haber', width: 14 },
      { header: 'Saldo inicial', key: 'saldoInicial', width: 14 },
      { header: 'Saldo acumulado', key: 'saldo', width: 16 },
      { header: 'Saldo final', key: 'saldoFinal', width: 14 },
    ]);

    const saldoInicial = 0;
    let saldo = saldoInicial;
    for (const linea of cuenta?.lineas ?? []) {
      const debe = toNumber(linea.debe);
      const haber = toNumber(linea.haber);
      saldo += debe - haber;
      sh.addRow({
        cuenta: cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : '',
        fecha: new Date(linea.asientoContable.fecha),
        asiento: linea.asientoContable.id,
        descripcion: linea.asientoContable.descripcion ?? '',
        debe,
        haber,
        saldoInicial,
        saldo,
        saldoFinal: saldo,
      });
    }

    this.excel.moneyFormat(sh, [
      'debe',
      'haber',
      'saldoInicial',
      'saldo',
      'saldoFinal',
    ]);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteEstadoCuentaCliente(
    query: QueryEstadoCuentaCliente,
  ): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Estado de Cuenta de Cliente');

    const cliente = await this.prisma.cliente.findUnique({
      where: { id: query.clienteId },
      include: {
        VentaCuota: {
          where: {
            ...(query.fechaInicio || query.fechaFin
              ? {
                  fechaContrato: {
                    ...(query.fechaInicio
                      ? { gte: new Date(query.fechaInicio) }
                      : {}),
                    ...(query.fechaFin
                      ? { lte: new Date(query.fechaFin) }
                      : {}),
                  },
                }
              : {}),
          },
          include: {
            abonos: {
              include: {
                detalles: true,
              },
              orderBy: { fechaAbono: 'asc' },
            },
            cuotas: {
              orderBy: { numero: 'asc' },
            },
            usuario: true,
            sucursal: true,
          },
          orderBy: { fechaContrato: 'asc' },
        },
      },
    });

    this.excel.setColumns(sh, [
      { header: 'Cliente', key: 'cliente', width: 28 },
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Documento', key: 'documento', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 18 },
      { header: 'Cargo', key: 'cargo', width: 14 },
      { header: 'Abono', key: 'abono', width: 14 },
      { header: 'Saldo', key: 'saldo', width: 14 },
      { header: 'Observación', key: 'observacion', width: 28 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
    ]);

    let saldo = 0;
    const clienteNombre = cliente?.apellidos
      ? `${cliente.nombre} ${cliente.apellidos}`
      : (cliente?.nombre ?? '');

    for (const ventaCuota of cliente?.VentaCuota ?? []) {
      const cargo = toNumber(ventaCuota.totalVenta);
      saldo += cargo;

      sh.addRow({
        cliente: clienteNombre,
        fecha: new Date(ventaCuota.fechaContrato ?? ventaCuota.fechaInicio),
        documento: ventaCuota.numeroCredito ?? ventaCuota.id,
        tipo: 'Venta a cuota',
        cargo,
        abono: 0,
        saldo,
        observacion: ventaCuota.comentario ?? '',
        metodoPago: '',
      });

      for (const abono of ventaCuota.abonos ?? []) {
        const ab = toNumber(abono.montoTotal);
        saldo -= ab;

        sh.addRow({
          cliente: clienteNombre,
          fecha: new Date(abono.fechaAbono),
          documento: abono.id,
          tipo: 'Abono',
          cargo: 0,
          abono: ab,
          saldo,
          observacion: abono.referenciaPago ?? '',
          metodoPago: abono.metodoPago ?? '',
        });
      }
    }

    this.excel.moneyFormat(sh, ['cargo', 'abono', 'saldo']);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteEstadoCuentaProveedor(
    query: QueryEstadoCuentaProveedor,
  ): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Estado de Cuenta de Proveedor');

    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id: query.proveedorId },
      include: {
        compras: {
          where: {
            ...(query.fechaInicio || query.fechaFin
              ? {
                  fecha: {
                    ...(query.fechaInicio
                      ? { gte: new Date(query.fechaInicio) }
                      : {}),
                    ...(query.fechaFin
                      ? { lte: new Date(query.fechaFin) }
                      : {}),
                  },
                }
              : {}),
          },
          orderBy: { fecha: 'asc' },
        },
        movimientosCaja: {
          where: {
            ...(query.fechaInicio || query.fechaFin
              ? {
                  fecha: {
                    ...(query.fechaInicio
                      ? { gte: new Date(query.fechaInicio) }
                      : {}),
                    ...(query.fechaFin
                      ? { lte: new Date(query.fechaFin) }
                      : {}),
                  },
                }
              : {}),
          },
          orderBy: { fecha: 'asc' },
        },
      },
    });

    this.excel.setColumns(sh, [
      { header: 'Proveedor', key: 'proveedor', width: 28 },
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Documento', key: 'documento', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 18 },
      { header: 'Cargo', key: 'cargo', width: 14 },
      { header: 'Abono', key: 'abono', width: 14 },
      { header: 'Saldo', key: 'saldo', width: 14 },
      { header: 'Observación', key: 'observacion', width: 28 },
    ]);

    let saldo = 0;
    const proveedorNombre = proveedor?.nombre ?? '';

    for (const compra of proveedor?.compras ?? []) {
      const cargo = toNumber(compra.total);
      saldo += cargo;

      sh.addRow({
        proveedor: proveedorNombre,
        fecha: new Date(compra.fecha),
        documento: compra.facturaNumero ?? compra.id,
        tipo: 'Compra',
        cargo,
        abono: 0,
        saldo,
        observacion: [
          compra.origen ? `Origen: ${compra.origen}` : null,
          compra.estado ? `Estado: ${compra.estado}` : null,
          compra.conFactura ? 'Con factura' : 'Sin factura',
        ]
          .filter(Boolean)
          .join(' | '),
      });
    }

    for (const mov of proveedor?.movimientosCaja ?? []) {
      const monto = Math.abs(
        toNumber(mov.deltaCaja) || toNumber(mov.deltaBanco),
      );
      if (!monto) continue;

      saldo -= monto;

      sh.addRow({
        proveedor: proveedorNombre,
        fecha: new Date(mov.fecha),
        documento: mov.referencia ?? mov.id,
        tipo: 'Abono',
        cargo: 0,
        abono: monto,
        saldo,
        observacion: mov.descripcion ?? mov.motivo ?? '',
      });
    }

    this.excel.moneyFormat(sh, ['cargo', 'abono', 'saldo']);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteVentas(query: QueryReporteVentas): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Reporte de Ventas');

    const fechaInicio = query.fechaInicio
      ? new Date(query.fechaInicio)
      : undefined;
    const fechaFin = query.fechaFin ? new Date(query.fechaFin) : undefined;

    const where: Prisma.VentaWhereInput = {
      ...(fechaInicio || fechaFin
        ? {
            fechaVenta: {
              ...(fechaInicio ? { gte: fechaInicio } : {}),
              ...(fechaFin ? { lte: fechaFin } : {}),
            },
          }
        : {}),
      ...(query.clienteId ? { clienteId: query.clienteId } : {}),
      ...(query.registroCajaId ? { registroCajaId: query.registroCajaId } : {}),
      ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                referenciaPago: { contains: query.search, mode: 'insensitive' },
              },
              {
                nombreClienteFinal: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                telefonoClienteFinal: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const ventas = await this.prisma.venta.findMany({
      where,
      include: {
        cliente: true,
        registroCaja: {
          include: {
            sucursal: true,
          },
        },
        usuario: true,
        metodoPago: true,
      },
      orderBy: { fechaVenta: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'VentaId', key: 'ventaId', width: 12 },
      { header: 'Cliente', key: 'cliente', width: 26 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Caja', key: 'caja', width: 14 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Referencia', key: 'referencia', width: 18 },
      { header: 'Posteado', key: 'posteado', width: 12 },
      { header: 'Comprobante', key: 'comprobante', width: 16 },
    ]);

    for (const v of ventas) {
      sh.addRow({
        fecha: new Date(v.fechaVenta),
        ventaId: v.id,
        cliente: v.cliente
          ? `${v.cliente.nombre}${v.cliente.apellidos ? ' ' + v.cliente.apellidos : ''}`
          : (v.nombreClienteFinal ?? ''),
        metodoPago: v.metodoPago ? 'Asignado' : 'Sin método', // ajusta al campo real de Pago
        total: toNumber(v.totalVenta),
        caja: v.registroCajaId ?? '',
        sucursal: v.registroCaja?.sucursal?.nombre ?? '',
        referencia: v.referenciaPago ?? '',
        posteado: v.asientoContableId ? 'Sí' : 'No',
        comprobante: v.tipoComprobante ?? '',
      });
    }

    this.excel.moneyFormat(sh, ['total']);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }
  async reporteGastos(query: QueryReporteGastos): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Reporte de Gastos');

    const fechaInicio = query.fechaInicio
      ? new Date(query.fechaInicio)
      : undefined;
    const fechaFin = query.fechaFin ? new Date(query.fechaFin) : undefined;

    const where: Prisma.MovimientoFinancieroWhereInput = {
      ...(fechaInicio || fechaFin
        ? {
            fecha: {
              ...(fechaInicio ? { gte: fechaInicio } : {}),
              ...(fechaFin ? { lte: fechaFin } : {}),
            },
          }
        : {}),

      ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
      ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),

      // ✅ ENUMS → igualdad directa (no contains)
      ...(query.motivo ? { motivo: query.motivo as MotivoMovimiento } : {}),
      ...(query.clasificacion
        ? { clasificacion: query.clasificacion as ClasificacionAdmin }
        : {}),
      ...(query.metodoPago
        ? { metodoPago: query.metodoPago as MetodoPago }
        : {}),

      // ✅ Solo egresos
      OR: [{ deltaCaja: { lt: 0 } }, { deltaBanco: { lt: 0 } }],

      // ✅ Búsqueda libre (solo en strings)
      ...(query.search
        ? {
            OR: [
              { descripcion: { contains: query.search, mode: 'insensitive' } },
              { referencia: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const movs = await this.prisma.movimientoFinanciero.findMany({
      where,
      include: {
        sucursal: true,
        usuario: true,
        cuentaBancaria: true,
      },
      orderBy: { fecha: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Motivo', key: 'motivo', width: 18 },
      { header: 'Clasificación', key: 'clasificacion', width: 18 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 30 },
      { header: 'Cuenta bancaria', key: 'cuenta', width: 24 },
      { header: 'Monto', key: 'monto', width: 14 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Usuario', key: 'usuario', width: 18 },
    ]);

    for (const m of movs) {
      const monto = Math.abs(toNumber(m.deltaCaja) || toNumber(m.deltaBanco));

      sh.addRow({
        fecha: new Date(m.fecha),
        motivo: m.motivo,
        clasificacion: m.clasificacion,
        metodoPago: m.metodoPago ?? '',
        descripcion: m.descripcion ?? '',
        cuenta: m.cuentaBancaria
          ? `${m.cuentaBancaria.banco} - ${m.cuentaBancaria.alias ?? ''}`
          : '',
        monto,
        sucursal: m.sucursal?.nombre ?? '',
        usuario: m.usuario?.nombre ?? '',
      });
    }

    this.excel.moneyFormat(sh, ['monto']);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteReglasContables(
    query: QueryReporteReglasContables,
  ): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Reporte de Reglas Contables');

    const where: Prisma.ReglaContableWhereInput = {
      ...(query.estado !== undefined
        ? { activa: query.estado === 'ACTIVA' }
        : {}),

      ...(query.origen
        ? { origen: query.origen as OrigenAsientoContable }
        : {}),

      ...(query.clasificacion
        ? { clasificacion: query.clasificacion as ClasificacionAdmin }
        : {}),

      ...(query.metodoPago
        ? { metodoPago: query.metodoPago as MetodoPago }
        : {}),
    };

    const reglas = await this.prisma.reglaContable.findMany({
      where,
      include: {
        cuentaDebe: true,
        cuentaHaber: true,
      },
      orderBy: [{ prioridad: 'asc' }, { codigo: 'asc' }],
    });

    this.excel.setColumns(sh, [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Nombre', key: 'nombre', width: 26 },
      { header: 'Origen', key: 'origen', width: 16 },
      { header: 'Clasificación', key: 'clasificacion', width: 18 },
      { header: 'Motivo', key: 'motivo', width: 18 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
      { header: 'Cuenta debe', key: 'cuentaDebe', width: 28 },
      { header: 'Cuenta haber', key: 'cuentaHaber', width: 28 },
      { header: 'Prioridad', key: 'prioridad', width: 10 },
      { header: 'Activa', key: 'activa', width: 10 },
      { header: 'Conteo de usos', key: 'usos', width: 14 },
      { header: 'Último uso', key: 'ultimoUso', width: 18 },
    ]);

    for (const r of reglas) {
      const usos = await this.prisma.asientoContable.count({
        where: {
          ...(r.origen ? { origen: r.origen } : {}),
          referencia: { contains: r.codigo, mode: 'insensitive' },
        },
      });

      sh.addRow({
        codigo: r.codigo,
        nombre: r.nombre,
        origen: r.origen ?? '',
        clasificacion: r.clasificacion ?? '',
        motivo: r.motivo ?? '',
        metodoPago: r.metodoPago ?? '',
        cuentaDebe: r.cuentaDebe
          ? `${r.cuentaDebe.codigo} - ${r.cuentaDebe.nombre}`
          : '',
        cuentaHaber: r.cuentaHaber
          ? `${r.cuentaHaber.codigo} - ${r.cuentaHaber.nombre}`
          : '',
        prioridad: r.prioridad ?? '',
        activa: r.activa ? 'Sí' : 'No',
        usos,
        ultimoUso: '',
      });
    }

    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteMovimientosSinAsiento(
    query: QueryMovimientosSinAsiento,
  ): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook('Movimientos sin Asiento / sin Regla');
    const movs = await this.prisma.movimientoFinanciero.findMany({
      where: {
        fecha: baseWhereDate(query.fechaInicio, query.fechaFin),
        asientoContableId: null,
        sucursalId: query.sucursalId,
      },
      include: { sucursal: true, usuario: true },
      orderBy: { fecha: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Motivo', key: 'motivo', width: 18 },
      { header: 'Clasificación', key: 'clasificacion', width: 18 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 30 },
      { header: 'Referencia', key: 'referencia', width: 18 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Tiene asiento', key: 'asiento', width: 12 },
      { header: 'Tiene regla', key: 'regla', width: 12 },
    ]);

    for (const m of movs) {
      sh.addRow({
        fecha: new Date(m.fecha),
        motivo: m.motivo ?? '',
        clasificacion: m.clasificacion ?? '',
        metodoPago: m.metodoPago ?? '',
        descripcion: m.descripcion ?? '',
        referencia: m.referencia ?? '',
        sucursal: m.sucursal?.nombre ?? '',
        asiento: m.asientoContableId ? 'Sí' : 'No',
        regla: 'Pendiente',
      });
    }

    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }

  async reporteEstadoBancario(query: QueryEstadoBancario): Promise<Buffer> {
    const { wb, sh } = this.baseWorkbook(
      'Estado Bancario / Flujo por cuenta bancaria',
    );
    const movs = await this.prisma.movimientoFinanciero.findMany({
      where: {
        fecha: baseWhereDate(query.fechaInicio, query.fechaFin),
        cuentaBancariaId: query.cuentaBancariaId,
        sucursalId: query.sucursalId,
      },
      include: { cuentaBancaria: true, sucursal: true, usuario: true },
      orderBy: { fecha: 'asc' },
    });

    this.excel.setColumns(sh, [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Banco', key: 'banco', width: 18 },
      { header: 'Cuenta', key: 'cuenta', width: 18 },
      { header: 'Método de pago', key: 'metodoPago', width: 16 },
      { header: 'Entrada', key: 'entrada', width: 14 },
      { header: 'Salida', key: 'salida', width: 14 },
      { header: 'Referencia', key: 'referencia', width: 18 },
      { header: 'Descripción', key: 'descripcion', width: 30 },
      { header: 'Sucursal', key: 'sucursal', width: 20 },
      { header: 'Usuario', key: 'usuario', width: 18 },
    ]);

    let saldo = 0;
    for (const m of movs) {
      const deltaBanco = toNumber(m.deltaBanco);
      saldo += deltaBanco;
      sh.addRow({
        fecha: new Date(m.fecha),
        banco: m.cuentaBancaria?.banco ?? '',
        cuenta: m.cuentaBancaria?.alias ?? '',
        metodoPago: m.metodoPago ?? '',
        entrada: deltaBanco > 0 ? deltaBanco : 0,
        salida: deltaBanco < 0 ? Math.abs(deltaBanco) : 0,
        referencia: m.referencia ?? '',
        descripcion: m.descripcion ?? '',
        sucursal: m.sucursal?.nombre ?? '',
        usuario: m.usuario?.nombre ?? '',
      });
    }

    this.excel.moneyFormat(sh, ['entrada', 'salida']);
    this.excel.dateTimeFormat(sh, ['fecha']);
    this.excel.finalizeSheet(sh, 4);
    return this.excel.toBuffer(wb);
  }
}
