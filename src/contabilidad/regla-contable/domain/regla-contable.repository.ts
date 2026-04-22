import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
} from '@prisma/client';
import { ReglaContable } from '../entities/regla-contable.entity';

export const REGLA_CONTABLE_REPOSITORY = Symbol('REGLA_CONTABLE_REPOSITORY');

export interface ReglaContableRepository {
  save(entity: ReglaContable, tx?: any): Promise<ReglaContable>;

  update(entity: ReglaContable, tx?: any): Promise<ReglaContable>;

  findById(id: number): Promise<ReglaContable | null>;

  findAll(): Promise<ReglaContable[]>;

  /**
   * 🔥 CLAVE: traer reglas candidatas (filtrado base en DB)
   */
  findByContext(params: {
    origen: OrigenAsientoContable;
    clasificacion?: ClasificacionAdmin;
    motivo?: MotivoMovimiento;
    metodoPago?: MetodoPago;
  }): Promise<ReglaContable[]>;

  delete(id: number, tx?: any): Promise<void>;
}
