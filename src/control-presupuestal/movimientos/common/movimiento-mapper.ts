import {
  Prisma,
  MovimientoPresupuesto as PrismaMovimiento,
} from '@prisma/client';
import { MovimientoPresupuesto } from '../entities/movimiento.entity';
import { TipoMovimientoPresupuesto } from '../interfaces/interfaces';

export class MovimientoMapper {
  /**
   * De Base de Datos a Dominio
   */
  static toDomain(raw: PrismaMovimiento): MovimientoPresupuesto {
    return new MovimientoPresupuesto(
      raw.id,
      raw.presupuestoId,
      raw.tipoMovimiento as TipoMovimientoPresupuesto,
      raw.monto,
      raw.fechaMovimiento,
      raw.descripcion,
      raw.requisicionId,
      raw.compraId,
      raw.usuarioId,
    );
  }

  /**
   * De Dominio a Base de Datos (Creación estricta)
   */
  static toPersistence(
    entity: MovimientoPresupuesto,
  ): Prisma.MovimientoPresupuestoUncheckedCreateInput {
    return {
      // Omitimos el ID para que Prisma siempre haga un INSERT autoincremental
      presupuestoId: entity.getPresupuestoId(),
      tipoMovimiento: entity.getTipoMovimiento(),
      monto: entity.getMonto(),
      descripcion: entity.getDescripcion(),
      requisicionId: entity.getRequisicionId(),
      compraId: entity.getCompraId(),
      usuarioId: entity.getUsuarioId(),
      fechaMovimiento: entity.getFechaMovimiento(),
    };
  }

  static toDomainList(rawList: PrismaMovimiento[]): MovimientoPresupuesto[] {
    return rawList.map((raw) => this.toDomain(raw));
  }
}
