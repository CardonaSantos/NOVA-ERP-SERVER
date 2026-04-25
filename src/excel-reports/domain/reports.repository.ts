import { QueryReport } from '../dto/query';
import { QueryReportCajas } from '../dto/query-cajas';

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

export interface ReportRepository {
  ventasUtilidadReport(query: QueryReport): Promise<Buffer>;

  ventasHistorial(query: QueryReport): Promise<Buffer>;

  reporteCajas(query: QueryReportCajas): Promise<Buffer>;

  // CONTABILIDAD
  libroDiario(query: QueryReport): Promise<Buffer>;
  libroMayor(query: QueryReport): Promise<Buffer>;
  balanceComprobacion(query: QueryReport): Promise<Buffer>;
  estadoResultados(query: QueryReport): Promise<Buffer>;
}
