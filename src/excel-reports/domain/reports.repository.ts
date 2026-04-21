import { QueryReport } from '../dto/query';
import { QueryReportCajas } from '../dto/query-cajas';

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

export interface ReportRepository {
  ventasUtilidadReport(query: QueryReport): Promise<Buffer>;

  ventasHistorial(query: QueryReport): Promise<Buffer>;

  reporteCajas(query: QueryReportCajas): Promise<Buffer>;
}
