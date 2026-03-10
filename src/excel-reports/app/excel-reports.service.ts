import { Inject, Injectable } from '@nestjs/common';
import {
  REPORT_REPOSITORY,
  ReportRepository,
} from '../domain/reports.repository';
import { QueryReport } from '../dto/query';

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
}
