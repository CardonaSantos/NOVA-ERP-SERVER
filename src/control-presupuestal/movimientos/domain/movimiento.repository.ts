import { Prisma } from '@prisma/client';
import { MovimientoPresupuesto } from '../entities/movimiento.entity';
import {
  MovimientoFiltros,
  PaginatedMovimientos,
} from '../interfaces/interfaces';

export const MOVIMIENTO_REPOSITORY = Symbol('MOVIMIENTO_REPOSITORY');

// EL CONTRATO DEL DOMINIO
export interface MovimientoRepository {
  /**
   * Registra un nuevo movimiento en la base de datos (Append-Only).
   * @param movimiento La entidad de dominio inmutable
   */
  save(
    movimiento: MovimientoPresupuesto,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoPresupuesto>;

  /**
   * Obtiene todo el historial de movimientos de un presupuesto específico.
   */
  findByPresupuestoId(presupuestoId: number): Promise<MovimientoPresupuesto[]>;

  /**
   * Busca si una Requisición ya generó un movimiento de "COMPROMISO".
   * Esto evita que un error de red duplique el cobro a un presupuesto.
   */
  findCompromisoByRequisicion(
    requisicionId: number,
  ): Promise<MovimientoPresupuesto | null>;

  findForTable(filtros: MovimientoFiltros): Promise<PaginatedMovimientos>;
}
