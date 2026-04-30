import { EstadoAsientoContable, OrigenAsientoContable } from '@prisma/client';
import {
  AsientoContablePaginatedResponse,
  AsientoContableResponse,
} from '../common/types-maps';
import { AsientoContable } from '../entities/asiento-contable.entity';

export const ASIENTO_CONTABLE_REPOSITORY = Symbol(
  'ASIENTO_CONTABLE_REPOSITORY',
);

export interface AsientoContableRepository {
  save(entity: AsientoContable, tx?: any): Promise<AsientoContable>;

  update(entity: AsientoContable, tx?: any): Promise<AsientoContable>;

  findById(id: number): Promise<AsientoContable | null>;
  // findAll(params: {
  //   page: number;
  //   pageSize: number;
  //   estado?: EstadoAsientoContable;
  //   origen?: OrigenAsientoContable;
  //   sortBy: string;
  //   sortOrder: 'asc' | 'desc';
  // }): Promise<{
  //   data: AsientoContableResponse[];
  //   total: number;
  //   page: number;
  //   pageSize: number;
  //   pageCount: number;
  // }>;

  findAll(params): Promise<AsientoContablePaginatedResponse>;

  delete(id: number, tx?: any): Promise<void>;
}
