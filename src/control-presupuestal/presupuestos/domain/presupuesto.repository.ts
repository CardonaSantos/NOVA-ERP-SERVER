import { Prisma } from '@prisma/client';
import { Presupuesto } from '../entities/presupuesto.entity';
import {
  PresupuestoDetalleView,
  PresupuestosPartidasSelect,
} from '../interfaces/interfaces-view';

// 1. EL TOKEN DE INYECCIÓN
// Usamos Symbol para garantizar que sea único en todo el contenedor de dependencias de NestJS
export const PRESUPUESTO_REPOSITORY = Symbol('PRESUPUESTO_REPOSITORY');

// 2. EL CONTRATO DEL DOMINIO
export interface PresupuestoRepository {
  save(
    presupuesto: Presupuesto,
    tx?: Prisma.TransactionClient,
  ): Promise<Presupuesto>;

  findById(id: number): Promise<Presupuesto | null>;

  findByLlaveCompuesta(
    periodoId: number,
    centroCostoId: number,
    partidaId: number,
  ): Promise<Presupuesto | null>;

  findAll(): Promise<Presupuesto[]>;

  findAllSelect(): Promise<Array<PresupuestosPartidasSelect>>;

  findAllDetalles(): Promise<PresupuestoDetalleView[]>;
  delete(id: number): Promise<void>;

  findDetalleById(id: number): Promise<PresupuestoDetalleView | null>;
}
