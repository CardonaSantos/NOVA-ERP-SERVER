import { QueryReport } from '../dto/query';

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

export interface ReportRepository {
  ventasUtilidadReport(query: QueryReport): Promise<Buffer>;

  ventasHistorial(query: QueryReport): Promise<Buffer>;
}
