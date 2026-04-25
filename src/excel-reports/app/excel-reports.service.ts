import { Inject, Injectable } from '@nestjs/common';
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
  REPORT_REPOSITORY,
  ReportRepository,
} from '../domain/reports.repository';
import { QueryReport } from '../dto/query';
import { QueryReportCajas } from '../dto/query-cajas';

@Injectable()
export class ExcelReportsService {
  constructor(
    @Inject(REPORT_REPOSITORY)
    private readonly reportRepo: ReportRepository,
  ) {}

  async reportUtilidad(query: QueryReport) {
    return await this.reportRepo.ventasUtilidadReport(query);
  }

  async reportVentas(query: QueryReport) {
    return await this.reportRepo.ventasHistorial(query);
  }

  async reportCajas(query: QueryReportCajas) {
    return await this.reportRepo.reporteCajas(query);
  }

  // CONTABILIDAD
  reportLibroDiario(query: QueryLibroDiario) {
    return this.reportRepo.reporteLibroDiario(query);
  }

  reportLibroMayorPorCuenta(query: QueryLibroMayor) {
    return this.reportRepo.reporteLibroMayorPorCuenta(query);
  }

  reportBalanceComprobacion(query: QueryBalanceComprobacion) {
    return this.reportRepo.reporteBalanceComprobacion(query);
  }

  reportEstadoResultados(query: QueryEstadoResultados) {
    return this.reportRepo.reporteEstadoResultados(query);
  }

  reportFlujoCaja(query: QueryFlujoCaja) {
    return this.reportRepo.reporteFlujoCaja(query);
  }

  reportEstadoCajaTurno(query: QueryEstadoCajaTurno) {
    return this.reportRepo.reporteEstadoCajaTurno(query);
  }

  reportEstadoCuentaContable(query: QueryEstadoCuentaContable) {
    return this.reportRepo.reporteEstadoCuentaContable(query);
  }

  reportEstadoCuentaCliente(query: QueryEstadoCuentaCliente) {
    return this.reportRepo.reporteEstadoCuentaCliente(query);
  }

  reportEstadoCuentaProveedor(query: QueryEstadoCuentaProveedor) {
    return this.reportRepo.reporteEstadoCuentaProveedor(query);
  }

  reportVentas2(query: QueryReporteVentas) {
    return this.reportRepo.reporteVentas(query);
  }

  reportGastos(query: QueryReporteGastos) {
    return this.reportRepo.reporteGastos(query);
  }

  reportReglasContables(query: QueryReporteReglasContables) {
    return this.reportRepo.reporteReglasContables(query);
  }

  reportMovimientosSinAsiento(query: QueryMovimientosSinAsiento) {
    return this.reportRepo.reporteMovimientosSinAsiento(query);
  }

  reportEstadoBancario(query: QueryEstadoBancario) {
    return this.reportRepo.reporteEstadoBancario(query);
  }
}
