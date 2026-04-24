import { Prisma } from '@prisma/client';
import { ReglaContable } from '../entities/regla-contable.entity';

export class ReglaContableMapper {
  static toDomain(raw: any): ReglaContable {
    return new ReglaContable(
      raw.id,
      raw.codigo,
      raw.nombre,
      raw.origen,
      raw.cuentaDebeId,
      raw.cuentaHaberId,
      raw.prioridad,
      raw.activa,
      raw.descripcion ?? undefined,
      raw.clasificacion ?? undefined,
      raw.motivo ?? undefined,
      raw.metodoPago ?? undefined,
      raw.usaCentroCosto,
      raw.usaPartidaPresupuestal,
    );
  }

  static toDomainList(rawList: any[]): ReglaContable[] {
    return rawList.map((r) => ReglaContableMapper.toDomain(r));
  }

  static toPersistence(
    entity: ReglaContable,
  ): Prisma.ReglaContableUncheckedUpdateInput {
    return {
      codigo: entity.getCodigo(),
      nombre: entity.getNombre(),
      descripcion: entity.getDescripcion() ?? null,
      origen: entity.getOrigen(),
      clasificacion: entity.getClasificacion() ?? null,
      motivo: entity.getMotivo() ?? null,
      metodoPago: entity.getMetodoPago() ?? null,
      cuentaDebeId: entity.getCuentaDebeId(),
      cuentaHaberId: entity.getCuentaHaberId(),
      usaCentroCosto: entity.usaCentroCostos(),
      usaPartidaPresupuestal: entity.usaPartidaPresupuesto(),
      activa: entity.estaActiva(),
      prioridad: entity.getPrioridad(),
    };
  }

  static toCreate(
    entity: ReglaContable,
  ): Prisma.ReglaContableUncheckedCreateInput {
    return {
      codigo: entity.getCodigo(),
      nombre: entity.getNombre(),
      descripcion: entity.getDescripcion() ?? null,
      origen: entity.getOrigen(),
      clasificacion: entity.getClasificacion() ?? null,
      motivo: entity.getMotivo() ?? null,
      metodoPago: entity.getMetodoPago() ?? null,
      cuentaDebeId: entity.getCuentaDebeId(),
      cuentaHaberId: entity.getCuentaHaberId(),
      usaCentroCosto: entity.usaCentroCostos(),
      usaPartidaPresupuestal: entity.usaPartidaPresupuesto(),
      activa: entity.estaActiva(),
      prioridad: entity.getPrioridad(),
    };
  }

  static toUpdate(
    entity: ReglaContable,
  ): Prisma.ReglaContableUncheckedUpdateInput {
    return {
      codigo: entity.getCodigo(),
      nombre: entity.getNombre(),
      descripcion: entity.getDescripcion() ?? null,
      origen: entity.getOrigen(),
      clasificacion: entity.getClasificacion() ?? null,
      motivo: entity.getMotivo() ?? null,
      metodoPago: entity.getMetodoPago() ?? null,
      cuentaDebeId: entity.getCuentaDebeId(),
      cuentaHaberId: entity.getCuentaHaberId(),
      usaCentroCosto: entity.usaCentroCostos(),
      usaPartidaPresupuestal: entity.usaPartidaPresupuesto(),
      activa: entity.estaActiva(),
      prioridad: entity.getPrioridad(),
    };
  }
}
