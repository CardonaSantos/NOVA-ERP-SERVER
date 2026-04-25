import { Inject, Injectable } from '@nestjs/common';
import {
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
  async libroDiario(query: QueryReport) {
    return this.reportRepo.libroDiario(query);
  }

  async libroMayor(query: QueryReport) {
    return this.reportRepo.libroMayor(query);
  }

  async balanceComprobacion(query: QueryReport) {
    return this.reportRepo.balanceComprobacion(query);
  }

  async estadoResultados(query: QueryReport) {
    return this.reportRepo.estadoResultados(query);
  }
}
