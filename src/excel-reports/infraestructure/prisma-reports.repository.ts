import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

type ReporteCajaMonetarioQuery = {
  from?: string;
  to?: string;
  sucursalId?: number | string;
  usuarioId?: number | string;
  estadoCaja?: string;
  clasificacion?: string;
  metodoPago?: string;
  motivo?: string;
  cuentaBancariaId?: number | string;
  incluirMovimientos?: string | boolean;
};

function baseWhereDate(fechaInicio?: Date, fechaFin?: Date) {
  const where: { gte?: Date; lt?: Date } = {};

  if (fechaInicio) {
    where.gte = dayjs(fechaInicio).startOf('day').toDate();
  }

  if (fechaFin) {
    where.lt = dayjs(fechaFin).add(1, 'day').startOf('day').toDate();
  }

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

  /**
   * CONSEGUIR REPORTES POR FECHAS Y RANGOS
   * @param query
   * @returns
   */
  async getReporteCajaMonetario(
    query: ReporteCajaMonetarioQuery,
  ): Promise<Buffer> {
    const {
      from,
      to,
      sucursalId,
      usuarioId,
      estadoCaja,
      clasificacion,
      metodoPago,
      motivo,
      cuentaBancariaId,
    } = query;

    const TZ = 'America/Guatemala';

    const incluirMovimientos =
      query.incluirMovimientos === true ||
      query.incluirMovimientos === 'true' ||
      query.incluirMovimientos === undefined;

    const parseOptionalNumber = (value?: number | string | null) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      const parsed = Number(value);

      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(`Valor numérico inválido: ${value}`);
      }

      return parsed;
    };

    const toNum = (value?: unknown) => {
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

    const rangeFrom = from
      ? dayjs.tz(from, TZ).startOf('day')
      : dayjs().tz(TZ).startOf('day');

    const rangeTo = to
      ? dayjs.tz(to, TZ).add(1, 'day').startOf('day')
      : dayjs().tz(TZ).add(1, 'day').startOf('day');

    if (!rangeFrom.isValid()) {
      throw new BadRequestException('Fecha inicial inválida.');
    }

    if (!rangeTo.isValid()) {
      throw new BadRequestException('Fecha final inválida.');
    }

    if (rangeFrom.isAfter(rangeTo)) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la fecha final.',
      );
    }

    const diffDays = rangeTo.diff(rangeFrom, 'day');

    this.logger.log(
      `[getReporteCajaMonetario] rangeFrom=${rangeFrom.format(
        'YYYY-MM-DD',
      )} rangeTo=${rangeTo.format('YYYY-MM-DD')} diffDays=${diffDays}`,
    );

    const sucursalIdNum = parseOptionalNumber(sucursalId);
    const usuarioIdNum = parseOptionalNumber(usuarioId);
    const cuentaBancariaIdNum = parseOptionalNumber(cuentaBancariaId);

    const whereMovimientos: Prisma.MovimientoFinancieroWhereInput = {};

    if (clasificacion) {
      whereMovimientos.clasificacion = clasificacion as any;
    }

    if (metodoPago) {
      whereMovimientos.metodoPago = metodoPago as any;
    }

    if (motivo) {
      whereMovimientos.motivo = motivo as any;
    }

    if (cuentaBancariaIdNum) {
      whereMovimientos.cuentaBancariaId = cuentaBancariaIdNum;
    }

    const tieneFiltroMovimientos = Object.keys(whereMovimientos).length > 0;

    const where: Prisma.RegistroCajaWhereInput = {
      creadoEn: {
        gte: rangeFrom.toDate(),
        lt: rangeTo.toDate(),
      },
    };

    if (sucursalIdNum) {
      where.sucursalId = sucursalIdNum;
    }

    if (usuarioIdNum) {
      where.usuarioInicioId = usuarioIdNum;
    }

    if (estadoCaja) {
      where.estado = estadoCaja as any;
    }

    if (tieneFiltroMovimientos) {
      where.movimientos = {
        some: whereMovimientos,
      };
    }

    const records = await this.prisma.registroCaja.findMany({
      where,
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

        sucursal: {
          select: {
            id: true,
            nombre: true,
          },
        },

        movimientos: {
          ...(tieneFiltroMovimientos ? { where: whereMovimientos } : {}),
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
            referencia: true,
            cuentaBancaria: {
              select: {
                id: true,
                banco: true,
                alias: true,
              },
            },
          },
          orderBy: {
            creadoEn: 'asc',
          },
        },
      },
      orderBy: {
        creadoEn: 'asc',
      },
    });

    const workbook = new Exeljs.Workbook();

    workbook.creator = 'NOVA ERP';
    workbook.created = new Date();

    const moneyFormat = '"Q"#,##0.00';

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

    const applyMoneyFormat = (
      ws: Exeljs.Worksheet,
      columns: string[],
    ): void => {
      for (const column of columns) {
        ws.getColumn(column).numFmt = moneyFormat;
      }
    };

    const addEmptyRowIfNeeded = (
      ws: Exeljs.Worksheet,
      rowsCount: number,
    ): void => {
      if (rowsCount > 0) return;

      ws.addRow({
        concepto: 'Sin registros',
        valor: 'No hay datos para el rango seleccionado.',
      });
    };

    const createFlujoBase = () => ({
      movimientos: 0,
      movimientosSalidaOperativaCaja: 0,
      movimientosDepositoBanco: 0,

      entradasCaja: 0,
      entradasBancoDirectas: 0,
      entradasBancoTotal: 0,
      ingresosReales: 0,

      salidasCajaTotal: 0,
      salidasOperativasCaja: 0,
      salidasBanco: 0,
      egresosReales: 0,

      depositosBanco: 0,

      netoCaja: 0,
      netoBanco: 0,
      netoReal: 0,
    });

    type FlujoBase = ReturnType<typeof createFlujoBase>;

    const recalcularFlujo = (target: FlujoBase): void => {
      target.ingresosReales =
        target.entradasCaja + target.entradasBancoDirectas;

      target.egresosReales = target.salidasOperativasCaja + target.salidasBanco;

      target.netoCaja = target.entradasCaja - target.salidasCajaTotal;

      target.netoBanco = target.entradasBancoTotal - target.salidasBanco;

      target.netoReal = target.ingresosReales - target.egresosReales;
    };

    const clasificarMovimiento = (deltaCaja: number, deltaBanco: number) => {
      const esEntradaCaja = deltaCaja > 0;
      const esSalidaCaja = deltaCaja < 0;

      const esDepositoABanco = deltaCaja < 0 && deltaBanco > 0;
      const esSalidaOperativaCaja = deltaCaja < 0 && deltaBanco === 0;

      const esEntradaBancoDirecta = deltaBanco > 0 && deltaCaja === 0;
      const esSalidaBanco = deltaBanco < 0;

      let tipoFlujo = 'NEUTRO';

      if (esDepositoABanco) {
        tipoFlujo = 'DEPÓSITO A BANCO';
      } else if (esSalidaOperativaCaja) {
        tipoFlujo = 'SALIDA OPERATIVA CAJA';
      } else if (esEntradaCaja) {
        tipoFlujo = 'ENTRADA CAJA';
      } else if (esEntradaBancoDirecta) {
        tipoFlujo = 'ENTRADA BANCO DIRECTA';
      } else if (esSalidaBanco) {
        tipoFlujo = 'SALIDA BANCO';
      }

      return {
        esEntradaCaja,
        esSalidaCaja,
        esDepositoABanco,
        esSalidaOperativaCaja,
        esEntradaBancoDirecta,
        esSalidaBanco,
        tipoFlujo,
      };
    };

    const aplicarMovimientoAFlujo = (
      target: FlujoBase,
      deltaCaja: number,
      deltaBanco: number,
    ): void => {
      const tipo = clasificarMovimiento(deltaCaja, deltaBanco);

      target.movimientos++;

      if (tipo.esEntradaCaja) {
        target.entradasCaja += deltaCaja;
      }

      if (tipo.esSalidaCaja) {
        target.salidasCajaTotal += Math.abs(deltaCaja);
      }

      if (tipo.esDepositoABanco) {
        target.depositosBanco += Math.abs(deltaCaja);
        target.movimientosDepositoBanco++;
      }

      if (tipo.esSalidaOperativaCaja) {
        target.salidasOperativasCaja += Math.abs(deltaCaja);
        target.movimientosSalidaOperativaCaja++;
      }

      if (tipo.esEntradaBancoDirecta) {
        target.entradasBancoDirectas += deltaBanco;
      }

      if (deltaBanco > 0) {
        target.entradasBancoTotal += deltaBanco;
      }

      if (tipo.esSalidaBanco) {
        target.salidasBanco += Math.abs(deltaBanco);
      }

      recalcularFlujo(target);
    };

    const resumenGeneral = {
      cajas: records.length,
      saldoInicialTotal: 0,
      saldoFinalTotal: 0,
      saldoEsperadoCaja: 0,
      diferenciaCaja: 0,
      ...createFlujoBase(),
    };

    const porDiaMap = new Map<
      string,
      {
        fecha: string;
        cajas: number;
      } & FlujoBase
    >();

    const porSucursalMap = new Map<
      string,
      {
        sucursalId: number | null;
        sucursal: string;
        cajas: number;
      } & FlujoBase
    >();

    const ensureDia = (fecha: string) => {
      if (!porDiaMap.has(fecha)) {
        porDiaMap.set(fecha, {
          fecha,
          cajas: 0,
          ...createFlujoBase(),
        });
      }

      return porDiaMap.get(fecha)!;
    };

    const ensureSucursal = (
      sucursalKey: string,
      sucursalId: number | null,
      sucursalNombre: string,
    ) => {
      if (!porSucursalMap.has(sucursalKey)) {
        porSucursalMap.set(sucursalKey, {
          sucursalId,
          sucursal: sucursalNombre,
          cajas: 0,
          ...createFlujoBase(),
        });
      }

      return porSucursalMap.get(sucursalKey)!;
    };

    const cajasRows: Array<Record<string, any>> = [];
    const movimientosRows: Array<Record<string, any>> = [];

    for (const caja of records) {
      const saldoInicial = toNum(caja.saldoInicial);
      const saldoFinal = toNum(caja.saldoFinal);

      const cajaFlujo = createFlujoBase();

      const sucursalIdActual = caja.sucursal?.id ?? null;
      const sucursalKey = String(sucursalIdActual ?? 'sin-sucursal');
      const sucursalNombre = caja.sucursal?.nombre ?? 'Sin sucursal';

      const sucursalResumen = ensureSucursal(
        sucursalKey,
        sucursalIdActual,
        sucursalNombre,
      );

      sucursalResumen.cajas++;

      const fechaCajaKey = dayjs(caja.creadoEn).tz(TZ).format('YYYY-MM-DD');
      const diaCaja = ensureDia(fechaCajaKey);
      diaCaja.cajas++;

      for (const mov of caja.movimientos) {
        const deltaCaja = toNum(mov.deltaCaja);
        const deltaBanco = toNum(mov.deltaBanco);

        const tipo = clasificarMovimiento(deltaCaja, deltaBanco);

        const fechaMovKey = dayjs(mov.creadoEn).tz(TZ).format('YYYY-MM-DD');
        const diaResumen = ensureDia(fechaMovKey);

        aplicarMovimientoAFlujo(cajaFlujo, deltaCaja, deltaBanco);
        aplicarMovimientoAFlujo(diaResumen, deltaCaja, deltaBanco);
        aplicarMovimientoAFlujo(sucursalResumen, deltaCaja, deltaBanco);
        aplicarMovimientoAFlujo(resumenGeneral, deltaCaja, deltaBanco);

        if (incluirMovimientos) {
          movimientosRows.push({
            cajaId: caja.id,
            sucursal: sucursalNombre,
            usuario: caja.usuarioInicio?.nombre ?? 'N/A',
            estadoCaja: caja.estado ?? '-',
            movimientoId: mov.id,
            fecha: mov.creadoEn ? new Date(mov.creadoEn) : null,
            motivo: mov.motivo ?? '-',
            clasificacion: mov.clasificacion ?? '-',
            metodoPago: mov.metodoPago ?? '-',
            tipoFlujo: tipo.tipoFlujo,
            descripcion: mov.descripcion ?? '-',
            gastoTipo: mov.gastoOperativoTipo ?? '-',
            costoTipo: mov.costoVentaTipo ?? '-',
            deltaCaja,
            deltaBanco,
            banco: mov.cuentaBancaria?.banco ?? '-',
            aliasCuenta: mov.cuentaBancaria?.alias ?? '-',
            referencia: mov.referencia ?? '-',
          });
        }
      }

      const saldoEsperado = saldoInicial + cajaFlujo.netoCaja;
      const diferencia = saldoFinal - saldoEsperado;

      resumenGeneral.saldoInicialTotal += saldoInicial;
      resumenGeneral.saldoFinalTotal += saldoFinal;
      resumenGeneral.saldoEsperadoCaja += saldoEsperado;
      resumenGeneral.diferenciaCaja += diferencia;

      cajasRows.push({
        cajaId: caja.id,
        sucursal: sucursalNombre,
        usuario: caja.usuarioInicio?.nombre ?? 'N/A',
        estado: caja.estado ?? '-',
        creadoEn: formatDate(caja.creadoEn),
        fechaApertura: formatDate(caja.fechaApertura),
        fechaCierre: formatDate(caja.fechaCierre),

        saldoInicial,
        saldoFinal,

        movimientos: cajaFlujo.movimientos,
        movimientosSalidaOperativaCaja:
          cajaFlujo.movimientosSalidaOperativaCaja,
        movimientosDepositoBanco: cajaFlujo.movimientosDepositoBanco,

        entradasCaja: cajaFlujo.entradasCaja,
        entradasBancoDirectas: cajaFlujo.entradasBancoDirectas,
        entradasBancoTotal: cajaFlujo.entradasBancoTotal,
        ingresosReales: cajaFlujo.ingresosReales,

        salidasCajaTotal: cajaFlujo.salidasCajaTotal,
        salidasOperativasCaja: cajaFlujo.salidasOperativasCaja,
        salidasBanco: cajaFlujo.salidasBanco,
        egresosReales: cajaFlujo.egresosReales,

        depositosBanco: cajaFlujo.depositosBanco,

        netoCaja: cajaFlujo.netoCaja,
        netoBanco: cajaFlujo.netoBanco,
        netoReal: cajaFlujo.netoReal,

        saldoEsperado,
        diferencia,
      });
    }

    const porDiaRows = Array.from(porDiaMap.values()).sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );

    const porSucursalRows = Array.from(porSucursalMap.values()).sort((a, b) =>
      a.sucursal.localeCompare(b.sucursal, 'es'),
    );

    /**
     * HOJA 1: RESUMEN
     */
    const sheetResumen = workbook.addWorksheet('Resumen');

    sheetResumen.columns = [
      { header: 'Sección', key: 'seccion', width: 18 },
      { header: 'Concepto', key: 'concepto', width: 36 },
      { header: 'Valor', key: 'valor', width: 22 },
    ];

    const resumenRows = [
      {
        seccion: 'Rango',
        concepto: 'Desde',
        valor: rangeFrom.format('YYYY-MM-DD'),
      },
      {
        seccion: 'Rango',
        concepto: 'Hasta',
        valor: rangeTo.subtract(1, 'day').format('YYYY-MM-DD'),
      },
      {
        seccion: 'Filtros',
        concepto: 'Sucursal ID',
        valor: sucursalIdNum ?? 'Todas',
      },
      {
        seccion: 'Filtros',
        concepto: 'Usuario ID',
        valor: usuarioIdNum ?? 'Todos',
      },
      {
        seccion: 'Filtros',
        concepto: 'Estado caja',
        valor: estadoCaja ?? 'Todos',
      },
      {
        seccion: 'Filtros',
        concepto: 'Clasificación',
        valor: clasificacion ?? 'Todas',
      },
      {
        seccion: 'Filtros',
        concepto: 'Método pago',
        valor: metodoPago ?? 'Todos',
      },
      {
        seccion: 'Filtros',
        concepto: 'Motivo',
        valor: motivo ?? 'Todos',
      },
      {
        seccion: 'Filtros',
        concepto: 'Cuenta bancaria ID',
        valor: cuentaBancariaIdNum ?? 'Todas',
      },

      {
        seccion: 'Resumen',
        concepto: 'Cajas',
        valor: resumenGeneral.cajas,
      },
      {
        seccion: 'Resumen',
        concepto: 'Movimientos',
        valor: resumenGeneral.movimientos,
      },
      {
        seccion: 'Resumen',
        concepto: 'Movimientos salida operativa caja',
        valor: resumenGeneral.movimientosSalidaOperativaCaja,
      },
      {
        seccion: 'Resumen',
        concepto: 'Movimientos depósito a banco',
        valor: resumenGeneral.movimientosDepositoBanco,
      },

      {
        seccion: 'Caja',
        concepto: 'Saldo inicial total',
        valor: resumenGeneral.saldoInicialTotal,
      },
      {
        seccion: 'Caja',
        concepto: 'Saldo final total',
        valor: resumenGeneral.saldoFinalTotal,
      },
      {
        seccion: 'Caja',
        concepto: 'Entradas caja',
        valor: resumenGeneral.entradasCaja,
      },
      {
        seccion: 'Caja',
        concepto: 'Salidas caja total',
        valor: resumenGeneral.salidasCajaTotal,
      },
      {
        seccion: 'Caja',
        concepto: 'Salidas operativas caja',
        valor: resumenGeneral.salidasOperativasCaja,
      },
      {
        seccion: 'Caja',
        concepto: 'Depósitos a banco',
        valor: resumenGeneral.depositosBanco,
      },
      {
        seccion: 'Caja',
        concepto: 'Neto caja',
        valor: resumenGeneral.netoCaja,
      },

      {
        seccion: 'Banco',
        concepto: 'Entradas banco directas',
        valor: resumenGeneral.entradasBancoDirectas,
      },
      {
        seccion: 'Banco',
        concepto: 'Entradas banco total',
        valor: resumenGeneral.entradasBancoTotal,
      },
      {
        seccion: 'Banco',
        concepto: 'Salidas banco',
        valor: resumenGeneral.salidasBanco,
      },
      {
        seccion: 'Banco',
        concepto: 'Neto banco',
        valor: resumenGeneral.netoBanco,
      },

      {
        seccion: 'Flujo real',
        concepto: 'Ingresos reales',
        valor: resumenGeneral.ingresosReales,
      },
      {
        seccion: 'Flujo real',
        concepto: 'Egresos reales',
        valor: resumenGeneral.egresosReales,
      },
      {
        seccion: 'Flujo real',
        concepto: 'Neto real',
        valor: resumenGeneral.netoReal,
      },

      {
        seccion: 'Control',
        concepto: 'Saldo esperado caja',
        valor: resumenGeneral.saldoEsperadoCaja,
      },
      {
        seccion: 'Control',
        concepto: 'Diferencia caja',
        valor: resumenGeneral.diferenciaCaja,
      },
    ];

    sheetResumen.addRows(resumenRows);
    styleHeader(sheetResumen);

    const conceptosMonetarios = new Set([
      'Saldo inicial total',
      'Saldo final total',
      'Entradas caja',
      'Salidas caja total',
      'Salidas operativas caja',
      'Depósitos a banco',
      'Neto caja',
      'Entradas banco directas',
      'Entradas banco total',
      'Salidas banco',
      'Neto banco',
      'Ingresos reales',
      'Egresos reales',
      'Neto real',
      'Saldo esperado caja',
      'Diferencia caja',
    ]);

    sheetResumen.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const concepto = String(row.getCell(2).value ?? '');

      if (conceptosMonetarios.has(concepto)) {
        row.getCell(3).numFmt = moneyFormat;
      }
    });

    /**
     * HOJA 2: POR DÍA
     */
    const sheetPorDia = workbook.addWorksheet('Por día');

    sheetPorDia.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Cajas', key: 'cajas', width: 10 },
      { header: 'Movimientos', key: 'movimientos', width: 14 },
      {
        header: 'Movs. Salida Operativa',
        key: 'movimientosSalidaOperativaCaja',
        width: 24,
      },
      {
        header: 'Movs. Depósito Banco',
        key: 'movimientosDepositoBanco',
        width: 24,
      },

      { header: 'Entradas Caja', key: 'entradasCaja', width: 16 },
      {
        header: 'Entradas Banco Directas',
        key: 'entradasBancoDirectas',
        width: 22,
      },
      {
        header: 'Entradas Banco Total',
        key: 'entradasBancoTotal',
        width: 20,
      },
      { header: 'Ingresos Reales', key: 'ingresosReales', width: 18 },

      {
        header: 'Salidas Caja Total',
        key: 'salidasCajaTotal',
        width: 18,
      },
      {
        header: 'Salidas Operativas Caja',
        key: 'salidasOperativasCaja',
        width: 24,
      },
      { header: 'Salidas Banco', key: 'salidasBanco', width: 16 },
      { header: 'Egresos Reales', key: 'egresosReales', width: 18 },

      { header: 'Depósitos a Banco', key: 'depositosBanco', width: 18 },

      { header: 'Neto Caja', key: 'netoCaja', width: 16 },
      { header: 'Neto Banco', key: 'netoBanco', width: 16 },
      { header: 'Neto Real', key: 'netoReal', width: 16 },
    ];

    sheetPorDia.addRows(porDiaRows);
    addEmptyRowIfNeeded(sheetPorDia, porDiaRows.length);
    styleHeader(sheetPorDia);
    applyMoneyFormat(sheetPorDia, [
      'entradasCaja',
      'entradasBancoDirectas',
      'entradasBancoTotal',
      'ingresosReales',
      'salidasCajaTotal',
      'salidasOperativasCaja',
      'salidasBanco',
      'egresosReales',
      'depositosBanco',
      'netoCaja',
      'netoBanco',
      'netoReal',
    ]);

    /**
     * HOJA 3: POR SUCURSAL
     */
    const sheetPorSucursal = workbook.addWorksheet('Por sucursal');

    sheetPorSucursal.columns = [
      { header: 'Sucursal ID', key: 'sucursalId', width: 12 },
      { header: 'Sucursal', key: 'sucursal', width: 24 },
      { header: 'Cajas', key: 'cajas', width: 10 },
      { header: 'Movimientos', key: 'movimientos', width: 14 },
      {
        header: 'Movs. Salida Operativa',
        key: 'movimientosSalidaOperativaCaja',
        width: 24,
      },
      {
        header: 'Movs. Depósito Banco',
        key: 'movimientosDepositoBanco',
        width: 24,
      },

      { header: 'Entradas Caja', key: 'entradasCaja', width: 16 },
      {
        header: 'Entradas Banco Directas',
        key: 'entradasBancoDirectas',
        width: 22,
      },
      {
        header: 'Entradas Banco Total',
        key: 'entradasBancoTotal',
        width: 20,
      },
      { header: 'Ingresos Reales', key: 'ingresosReales', width: 18 },

      {
        header: 'Salidas Caja Total',
        key: 'salidasCajaTotal',
        width: 18,
      },
      {
        header: 'Salidas Operativas Caja',
        key: 'salidasOperativasCaja',
        width: 24,
      },
      { header: 'Salidas Banco', key: 'salidasBanco', width: 16 },
      { header: 'Egresos Reales', key: 'egresosReales', width: 18 },

      { header: 'Depósitos a Banco', key: 'depositosBanco', width: 18 },

      { header: 'Neto Caja', key: 'netoCaja', width: 16 },
      { header: 'Neto Banco', key: 'netoBanco', width: 16 },
      { header: 'Neto Real', key: 'netoReal', width: 16 },
    ];

    sheetPorSucursal.addRows(porSucursalRows);
    addEmptyRowIfNeeded(sheetPorSucursal, porSucursalRows.length);
    styleHeader(sheetPorSucursal);
    applyMoneyFormat(sheetPorSucursal, [
      'entradasCaja',
      'entradasBancoDirectas',
      'entradasBancoTotal',
      'ingresosReales',
      'salidasCajaTotal',
      'salidasOperativasCaja',
      'salidasBanco',
      'egresosReales',
      'depositosBanco',
      'netoCaja',
      'netoBanco',
      'netoReal',
    ]);

    /**
     * HOJA 4: CAJAS
     */
    const sheetCajas = workbook.addWorksheet('Cajas');

    sheetCajas.columns = [
      { header: 'ID Caja', key: 'cajaId', width: 10 },
      { header: 'Sucursal', key: 'sucursal', width: 22 },
      { header: 'Usuario', key: 'usuario', width: 22 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Creado En', key: 'creadoEn', width: 19 },
      { header: 'F. Apertura', key: 'fechaApertura', width: 19 },
      { header: 'F. Cierre', key: 'fechaCierre', width: 19 },

      { header: 'Saldo Inicial', key: 'saldoInicial', width: 15 },
      { header: 'Saldo Final', key: 'saldoFinal', width: 15 },

      { header: 'Movimientos', key: 'movimientos', width: 12 },
      {
        header: 'Movs. Salida Operativa',
        key: 'movimientosSalidaOperativaCaja',
        width: 24,
      },
      {
        header: 'Movs. Depósito Banco',
        key: 'movimientosDepositoBanco',
        width: 24,
      },

      { header: 'Entradas Caja', key: 'entradasCaja', width: 16 },
      {
        header: 'Entradas Banco Directas',
        key: 'entradasBancoDirectas',
        width: 22,
      },
      {
        header: 'Entradas Banco Total',
        key: 'entradasBancoTotal',
        width: 20,
      },
      { header: 'Ingresos Reales', key: 'ingresosReales', width: 18 },

      {
        header: 'Salidas Caja Total',
        key: 'salidasCajaTotal',
        width: 18,
      },
      {
        header: 'Salidas Operativas Caja',
        key: 'salidasOperativasCaja',
        width: 24,
      },
      { header: 'Salidas Banco', key: 'salidasBanco', width: 16 },
      { header: 'Egresos Reales', key: 'egresosReales', width: 18 },

      { header: 'Depósitos a Banco', key: 'depositosBanco', width: 18 },

      { header: 'Neto Caja', key: 'netoCaja', width: 16 },
      { header: 'Neto Banco', key: 'netoBanco', width: 16 },
      { header: 'Neto Real', key: 'netoReal', width: 16 },

      { header: 'Saldo Esperado', key: 'saldoEsperado', width: 16 },
      { header: 'Diferencia', key: 'diferencia', width: 14 },
    ];

    sheetCajas.addRows(cajasRows);
    addEmptyRowIfNeeded(sheetCajas, cajasRows.length);
    styleHeader(sheetCajas);
    applyMoneyFormat(sheetCajas, [
      'saldoInicial',
      'saldoFinal',
      'entradasCaja',
      'entradasBancoDirectas',
      'entradasBancoTotal',
      'ingresosReales',
      'salidasCajaTotal',
      'salidasOperativasCaja',
      'salidasBanco',
      'egresosReales',
      'depositosBanco',
      'netoCaja',
      'netoBanco',
      'netoReal',
      'saldoEsperado',
      'diferencia',
    ]);

    /**
     * HOJA 5: MOVIMIENTOS
     */
    if (incluirMovimientos) {
      const sheetMovs = workbook.addWorksheet('Movimientos');

      sheetMovs.columns = [
        { header: 'ID Caja', key: 'cajaId', width: 10 },
        { header: 'Sucursal', key: 'sucursal', width: 22 },
        { header: 'Usuario', key: 'usuario', width: 22 },
        { header: 'Estado Caja', key: 'estadoCaja', width: 14 },
        { header: 'ID Movimiento', key: 'movimientoId', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 19 },
        { header: 'Motivo', key: 'motivo', width: 20 },
        { header: 'Clasificación', key: 'clasificacion', width: 18 },
        { header: 'Método Pago', key: 'metodoPago', width: 16 },
        { header: 'Tipo Flujo', key: 'tipoFlujo', width: 24 },
        { header: 'Descripción', key: 'descripcion', width: 36 },
        { header: 'Tipo Gasto', key: 'gastoTipo', width: 18 },
        { header: 'Tipo Costo', key: 'costoTipo', width: 18 },
        { header: 'Delta Caja', key: 'deltaCaja', width: 14 },
        { header: 'Delta Banco', key: 'deltaBanco', width: 14 },
        { header: 'Banco', key: 'banco', width: 18 },
        { header: 'Alias Cuenta', key: 'aliasCuenta', width: 18 },
        { header: 'Referencia', key: 'referencia', width: 18 },
      ];

      sheetMovs.addRows(
        movimientosRows.sort(
          (a, b) =>
            new Date(a.fecha ?? 0).getTime() - new Date(b.fecha ?? 0).getTime(),
        ),
      );

      addEmptyRowIfNeeded(sheetMovs, movimientosRows.length);
      styleHeader(sheetMovs);

      sheetMovs.getColumn('fecha').numFmt = 'dd/mm/yyyy hh:mm';
      sheetMovs.getColumn('descripcion').alignment = {
        wrapText: true,
        vertical: 'top',
      };

      applyMoneyFormat(sheetMovs, ['deltaCaja', 'deltaBanco']);
    }

    const buff = await workbook.xlsx.writeBuffer();
    return Buffer.from(buff);
  }

  // CONTABILIDAD

  private async fetchAllForLibro(query: QueryLibroDiario) {
    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const where: Prisma.AsientoContableWhereInput = {
      ...(fechaWhere ? { fecha: fechaWhere } : {}),

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

    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const cuentas = await this.prisma.cuentaContable.findMany({
      where: { id: query.cuentaContableId, activa: true },
      include: {
        lineas: {
          where: {
            ...(fechaWhere
              ? {
                  asientoContable: {
                    fecha: fechaWhere,
                  },
                }
              : {}),
          },
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
    const fechasFromUtils = baseWhereDate(query.fechaInicio, query.fechaFin);

    this.logger.log(
      `Fechas retornadas:\n${JSON.stringify(fechasFromUtils, null, 2)}`,
    );
    const cuentas = await this.prisma.cuentaContable.findMany({
      where: {
        activa: true,

        ...(query.cuentaContableId ? { id: query.cuentaContableId } : {}),
        // ...(query.estado ? { })
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
    this.logger.log(
      `DTO recibido en reporteEstadoResultados:\n${JSON.stringify(query, null, 2)}`,
    );
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
    this.logger.log(
      `DTO recibido en reporteFlujoCaja:\n${JSON.stringify(query, null, 2)}`,
    );

    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const where: Prisma.MovimientoFinancieroWhereInput = {
      ...(fechaWhere ? { fecha: fechaWhere } : {}),

      ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
      ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),
      ...(query.registroCajaId ? { registroCajaId: query.registroCajaId } : {}),
      ...(query.cuentaBancariaId
        ? { cuentaBancariaId: query.cuentaBancariaId }
        : {}),

      ...(query.motivo ? { motivo: query.motivo } : {}),
      ...(query.clasificacion ? { clasificacion: query.clasificacion } : {}),
      ...(query.metodoPago ? { metodoPago: query.metodoPago } : {}),

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
    this.logger.log(
      `DTO recibido en reporteEstadoCajaTurno:\n${JSON.stringify(query, null, 2)}`,
    );

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
    this.logger.log(`EL QUERY ES:\n${JSON.stringify(query, null, 2)}`);

    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const cliente = await this.prisma.cliente.findUnique({
      where: { id: query.clienteId },
      include: {
        VentaCuota: {
          where: {
            ...(fechaWhere
              ? {
                  fechaContrato: fechaWhere,
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
    this.logger.log(
      `DTO recibido reporteEstadoCuentaProveedor :\n${JSON.stringify(query, null, 2)}`,
    );
    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id: query.proveedorId },
      include: {
        compras: {
          where: {
            ...(fechaWhere ? { fecha: fechaWhere } : {}),
          },
          orderBy: { fecha: 'asc' },
        },
        movimientosCaja: {
          where: {
            ...(fechaWhere ? { fecha: fechaWhere } : {}),
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
    this.logger.log(
      `DTO recibido en reporteVentas:\n${JSON.stringify(query, null, 2)}`,
    );
    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const where: Prisma.VentaWhereInput = {
      ...(fechaWhere ? { fechaVenta: fechaWhere } : {}),
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
        metodoPago: v.metodoPago.metodoPago
          ? v.metodoPago.metodoPago
          : 'Sin método',
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
    this.logger.log(
      `DTO recibido en reporteGastos:\n${JSON.stringify(query, null, 2)}`,
    );
    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const where: Prisma.MovimientoFinancieroWhereInput = {
      ...(fechaWhere ? { fecha: fechaWhere } : {}),

      ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
      ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),

      ...(query.motivo ? { motivo: query.motivo as MotivoMovimiento } : {}),
      ...(query.clasificacion
        ? { clasificacion: query.clasificacion as ClasificacionAdmin }
        : {}),
      ...(query.metodoPago
        ? { metodoPago: query.metodoPago as MetodoPago }
        : {}),

      AND: [
        {
          OR: [{ deltaCaja: { lt: 0 } }, { deltaBanco: { lt: 0 } }],
        },
        // ...(query.search
        //   ? [
        //       {
        //         OR: [
        //           // { descripcion: { contains: query.search, mode: 'insensitive' } },
        //           // { referencia: { contains: query.search, mode: 'insensitive' } },
        //         ],
        //       },
        //     ]
        //   : []),
      ],
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
    this.logger.log(
      `DTO recibido en reporteMovimientosSinAsiento:\n${JSON.stringify(query, null, 2)}`,
    );
    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const movs = await this.prisma.movimientoFinanciero.findMany({
      where: {
        ...(fechaWhere ? { fecha: fechaWhere } : {}),
        asientoContableId: null,
        ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
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

    this.logger.log(
      `DTO recibido reporteEstadoBancario:\n${JSON.stringify(query, null, 2)}`,
    );

    const fechaWhere = baseWhereDate(query.fechaInicio, query.fechaFin);

    const movs = await this.prisma.movimientoFinanciero.findMany({
      where: {
        ...(fechaWhere ? { fecha: fechaWhere } : {}),
        ...(query.cuentaBancariaId
          ? { cuentaBancariaId: query.cuentaBancariaId }
          : {}),
        ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}),
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
