import { CentroCosto } from '../entities/centros-costo.entity';

export const CENTRO_COSTO_REPOSITORY = Symbol('CENTRO_COSTO_REPOSITORY');

export interface CentroCostoRepository {
  save(centroCosto: CentroCosto): Promise<CentroCosto>;
  update(centroCosto: CentroCosto): Promise<CentroCosto>;

  findById(id: number): Promise<CentroCosto | null>;
  findAll(): Promise<Array<CentroCosto>>;

  delete(id: number): Promise<void>;
}
