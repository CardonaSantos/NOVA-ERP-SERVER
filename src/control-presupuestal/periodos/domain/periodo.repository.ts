import { PeriodoPresupuestal } from '../entities/periodo.entity';

export const PERIODO_PRESUPUESTAL_REPOSITORY = Symbol(
  'PERIODO_PRESUPUESTAL_REPOSITORY',
);
export interface PeriodoRepository {
  save(periodo: PeriodoPresupuestal): Promise<PeriodoPresupuestal>;

  findById(id: number): Promise<PeriodoPresupuestal>;

  delete(id: number): void;

  findAll(): Promise<Array<PeriodoPresupuestal>>;
}
