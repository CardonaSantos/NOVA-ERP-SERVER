import { AsientoContable } from '../entities/asiento-contable.entity';

export const ASIENTO_CONTABLE_REPOSITORY = Symbol(
  'ASIENTO_CONTABLE_REPOSITORY',
);

export interface AsientoContableRepository {
  save(entity: AsientoContable, tx?: any): Promise<AsientoContable>;

  update(entity: AsientoContable, tx?: any): Promise<AsientoContable>;

  findById(id: number): Promise<AsientoContable | null>;
  findAll(): Promise<Array<AsientoContable>>;

  delete(id: number, tx?: any): Promise<void>;
}
