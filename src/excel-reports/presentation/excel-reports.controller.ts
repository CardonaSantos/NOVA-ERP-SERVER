import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
  Res,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ExcelReportsService } from '../app/excel-reports.service';
import { CreateExcelReportDto } from '../dto/create-excel-report.dto';
import { UpdateExcelReportDto } from '../dto/update-excel-report.dto';
import { QueryReport } from '../dto/query';
import { Response } from 'express';
import { QueryReportCajas } from '../dto/query-cajas';
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
} from '../domain/reports.repository';

@Controller('excel-reports')
export class ExcelReportsController {
  private readonly logger = new Logger(ExcelReportsController.name);
  constructor(private readonly excelReportsService: ExcelReportsService) {}

  @Get('ping')
  ping() {
    return 'ok';
  }

  @Post('utilidad-ventas')
  async reporteUtilidad(@Body() dto: QueryReport, @Res() res: Response) {
    this.logger.log(`El query es:\n${JSON.stringify(dto, null, 2)}`);
    const buffer = await this.excelReportsService.reportUtilidad(dto);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="utilidad_reporte_${Date.now()}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post('ventas')
  async reporteVentas(@Body() dto: QueryReport, @Res() res: Response) {
    this.logger.log(`El query es:\n${JSON.stringify(dto, null, 2)}`);
    const buffer = await this.excelReportsService.reportVentas(dto);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte_ventas_${Date.now()}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post('cajas')
  async reporteCajas(@Body() dto: QueryReportCajas, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportCajas(dto);
    this.logger.log(`El query es:\n${JSON.stringify(dto, null, 2)}`);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte_cajas_${Date.now()}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  // CONTABILIDAD MODULO
  private sendXlsx(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post('libro-diario')
  async libroDiario(@Body() dto: QueryLibroDiario, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportLibroDiario(dto);
    this.logger.log(`Libro diario: ${JSON.stringify(dto)}`);
    return this.sendXlsx(res, buffer, `libro_diario_${Date.now()}.xlsx`);
  }

  @Post('libro-mayor')
  async libroMayor(@Body() dto: QueryLibroMayor, @Res() res: Response) {
    const buffer =
      await this.excelReportsService.reportLibroMayorPorCuenta(dto);
    return this.sendXlsx(res, buffer, `libro_mayor_${Date.now()}.xlsx`);
  }

  @Post('balance-comprobacion')
  async balanceComprobacion(
    @Body() dto: QueryBalanceComprobacion,
    @Res() res: Response,
  ) {
    this.logger.log(
      `DTO recibido en balanceComprobacion:\n${JSON.stringify(dto, null, 2)}`,
    );
    const buffer =
      await this.excelReportsService.reportBalanceComprobacion(dto);
    return this.sendXlsx(
      res,
      buffer,
      `balance_comprobacion_${Date.now()}.xlsx`,
    );
  }

  @Post('estado-resultados')
  async estadoResultados(
    @Body() dto: QueryEstadoResultados,
    @Res() res: Response,
  ) {
    const buffer = await this.excelReportsService.reportEstadoResultados(dto);
    return this.sendXlsx(res, buffer, `estado_resultados_${Date.now()}.xlsx`);
  }

  @Post('flujo-caja')
  async flujoCaja(@Body() dto: QueryFlujoCaja, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportFlujoCaja(dto);
    return this.sendXlsx(res, buffer, `flujo_caja_${Date.now()}.xlsx`);
  }

  @Post('estado-caja-turno')
  async estadoCajaTurno(
    @Body() dto: QueryEstadoCajaTurno,
    @Res() res: Response,
  ) {
    const buffer = await this.excelReportsService.reportEstadoCajaTurno(dto);
    return this.sendXlsx(res, buffer, `estado_caja_turno_${Date.now()}.xlsx`);
  }

  // PENDIENTE POR REVISAR
  @Post('estado-cuenta-contable')
  async estadoCuentaContable(
    @Body() dto: QueryEstadoCuentaContable,
    @Res() res: Response,
  ) {
    const buffer =
      await this.excelReportsService.reportEstadoCuentaContable(dto);
    return this.sendXlsx(
      res,
      buffer,
      `estado_cuenta_contable_${Date.now()}.xlsx`,
    );
  }
  // PENDIENTE REVISAR
  @Post('estado-cuenta-cliente')
  async estadoCuentaCliente(
    @Body() dto: QueryEstadoCuentaCliente,
    @Res() res: Response,
  ) {
    const buffer =
      await this.excelReportsService.reportEstadoCuentaCliente(dto);
    return this.sendXlsx(
      res,
      buffer,
      `estado_cuenta_cliente_${Date.now()}.xlsx`,
    );
  }

  // PENDIENTE REVISAR
  @Post('estado-cuenta-proveedor')
  async estadoCuentaProveedor(
    @Body() dto: QueryEstadoCuentaProveedor,
    @Res() res: Response,
  ) {
    const buffer =
      await this.excelReportsService.reportEstadoCuentaProveedor(dto);
    return this.sendXlsx(
      res,
      buffer,
      `estado_cuenta_proveedor_${Date.now()}.xlsx`,
    );
  }

  @Post('ventas-2')
  async ventas(@Body() dto: QueryReporteVentas, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportVentas2(dto);
    return this.sendXlsx(res, buffer, `reporte_ventas_${Date.now()}.xlsx`);
  }

  @Post('gastos')
  async gastos(@Body() dto: QueryReporteGastos, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportGastos(dto);
    return this.sendXlsx(res, buffer, `reporte_gastos_${Date.now()}.xlsx`);
  }

  @Post('reglas-contables')
  async reglasContables(
    @Body() dto: QueryReporteReglasContables,
    @Res() res: Response,
  ) {
    const buffer = await this.excelReportsService.reportReglasContables(dto);
    return this.sendXlsx(
      res,
      buffer,
      `reporte_reglas_contables_${Date.now()}.xlsx`,
    );
  }

  @Post('movimientos-sin-asiento')
  async movimientosSinAsiento(
    @Body() dto: QueryMovimientosSinAsiento,
    @Res() res: Response,
  ) {
    const buffer =
      await this.excelReportsService.reportMovimientosSinAsiento(dto);
    return this.sendXlsx(
      res,
      buffer,
      `movimientos_sin_asiento_${Date.now()}.xlsx`,
    );
  }

  @Post('estado-bancario')
  async estadoBancario(@Body() dto: QueryEstadoBancario, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportEstadoBancario(dto);
    return this.sendXlsx(res, buffer, `estado_bancario_${Date.now()}.xlsx`);
  }
}
