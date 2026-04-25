import {
  ClasificacionAdmin,
  EstadoAsientoContable,
  EstadoTurnoCaja,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
} from '@prisma/client';
import { QueryReport } from '../dto/query';
import { QueryReportCajas } from '../dto/query-cajas';

// OTROS========================

export type ReportBuffer = Buffer;

export interface ReportQueryBase {
  fechaInicio?: Date;
  fechaFin?: Date;
  sucursalId?: number;
  usuarioId?: number;
  cuentaContableId?: number;
  clienteId?: number;
  proveedorId?: number;
  cuentaBancariaId?: number;
  registroCajaId?: number;
  motivo?: MotivoMovimiento;
  clasificacion?: ClasificacionAdmin;
  metodoPago?: MetodoPago;
  origen?: OrigenAsientoContable;
  search?: string;
}

export interface ReportQueryPaged extends ReportQueryBase {
  page?: number;
  limit?: number;
}

export interface QueryLibroDiario extends ReportQueryBase {
  estado?: EstadoAsientoContable;
}

export interface QueryLibroMayor extends ReportQueryBase {
  cuentaContableId: number;
}
export interface QueryBalanceComprobacion extends ReportQueryBase {
  estado?: EstadoAsientoContable;
}

export interface QueryEstadoResultados extends ReportQueryBase {
  estado?: EstadoAsientoContable;
}

export interface QueryFlujoCaja extends ReportQueryBase {}
export interface QueryEstadoCajaTurno extends ReportQueryBase {
  estado?: EstadoTurnoCaja;
}

export interface QueryEstadoCuentaContable extends ReportQueryBase {
  cuentaContableId: number;
}
export interface QueryEstadoCuentaCliente extends ReportQueryBase {
  clienteId: number;
}
export interface QueryEstadoCuentaProveedor extends ReportQueryBase {
  proveedorId: number;
}
export interface QueryReporteVentas extends ReportQueryBase {}
export interface QueryReporteGastos extends ReportQueryBase {}
export interface QueryReporteReglasContables extends ReportQueryBase {
  estado?: 'ACTIVA' | 'INACTIVA';
}
export interface QueryMovimientosSinAsiento extends ReportQueryBase {}
export interface QueryEstadoBancario extends ReportQueryBase {}

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

export interface ReportRepository {
  ventasUtilidadReport(query: QueryReport): Promise<Buffer>;

  ventasHistorial(query: QueryReport): Promise<Buffer>;

  reporteCajas(query: QueryReportCajas): Promise<Buffer>;

  // CONTABILIDAD
  reporteLibroDiario(query: QueryLibroDiario): Promise<ReportBuffer>;
  reporteLibroMayorPorCuenta(query: QueryLibroMayor): Promise<ReportBuffer>;
  reporteBalanceComprobacion(
    query: QueryBalanceComprobacion,
  ): Promise<ReportBuffer>;
  reporteEstadoResultados(query: QueryEstadoResultados): Promise<ReportBuffer>;
  reporteFlujoCaja(query: QueryFlujoCaja): Promise<ReportBuffer>;
  reporteEstadoCajaTurno(query: QueryEstadoCajaTurno): Promise<ReportBuffer>;
  reporteEstadoCuentaContable(
    query: QueryEstadoCuentaContable,
  ): Promise<ReportBuffer>;
  reporteEstadoCuentaCliente(
    query: QueryEstadoCuentaCliente,
  ): Promise<ReportBuffer>;
  reporteEstadoCuentaProveedor(
    query: QueryEstadoCuentaProveedor,
  ): Promise<ReportBuffer>;
  reporteVentas(query: QueryReporteVentas): Promise<ReportBuffer>;
  reporteGastos(query: QueryReporteGastos): Promise<ReportBuffer>;
  reporteReglasContables(
    query: QueryReporteReglasContables,
  ): Promise<ReportBuffer>;
  reporteMovimientosSinAsiento(
    query: QueryMovimientosSinAsiento,
  ): Promise<ReportBuffer>;
  reporteEstadoBancario(query: QueryEstadoBancario): Promise<ReportBuffer>;
}
