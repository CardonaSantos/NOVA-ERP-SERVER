import { CuentaContable } from '../entities/cuenta-contable.entity';

export const CUENTA_CONTABLE_REPOSITORY = Symbol('CUENTA_CONTABLE_REPOSITORY');

export interface CuentaContableRepository {
  save(entity: CuentaContable, tx?: any): Promise<CuentaContable>;

  update(entity: CuentaContable, tx?: any): Promise<CuentaContable>;

  findById(id: number): Promise<CuentaContable | null>;

  findAll(): Promise<Array<CuentaContable>>;

  findByCodigo(codigo: string): Promise<CuentaContable | null>;

  delete(id: number, tx?: any): Promise<void>;
}
