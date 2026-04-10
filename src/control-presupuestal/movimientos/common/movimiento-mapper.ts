import {
  Prisma,
  MovimientoPresupuesto as PrismaMovimiento,
} from '@prisma/client';
import { MovimientoPresupuesto } from '../entities/movimiento.entity';
import {
  MovimientoTableRow,
  TipoMovimientoPresupuesto,
} from '../interfaces/interfaces';

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

  // PARA TABLA ----------------------------

  // ── Prisma record enriquecido → fila de tabla UI ───────────────────────────
  // Recibe el record RAW de Prisma (con includes), NO la entidad de dominio.
  // Así la entidad permanece ignorante de la presentación.
  static toTableRow(record: any): MovimientoTableRow {
    // Origen: requisicion tiene prioridad sobre compra
    const origen = MovimientoMapper.resolveOrigen(record);

    return {
      id: record.id,
      fecha: record.fechaMovimiento,
      tipo: record.tipoMovimiento,
      monto: record.monto,
      descripcion: record.descripcion ?? null,

      partida: {
        codigo: record.presupuesto?.partida?.codigo ?? 'N/A',
        nombre: record.presupuesto?.partida?.nombre ?? 'N/A',
      },
      centroCosto: {
        codigo: record.presupuesto?.centroCosto?.codigo ?? null,
        nombre: record.presupuesto?.centroCosto?.nombre ?? 'N/A',
      },
      periodo: {
        id: record.presupuesto?.periodo?.id ?? 0,
        nombre: record.presupuesto?.periodo?.nombre ?? 'N/A',
      },

      usuario: record.usuario?.nombre ?? 'Sistema',
      origen,
    };
  }

  private static resolveOrigen(record: any): MovimientoTableRow['origen'] {
    if (record.requisicion) {
      return {
        tipo: 'requisicion',
        referencia: record.requisicion.folio ?? `Req #${record.requisicion.id}`,
        id: record.requisicion.id,
      };
    }
    if (record.compra) {
      return {
        tipo: 'compra',
        referencia: record.compra.folio ?? `OC-${record.compra.id}`,
        id: record.compra.id,
      };
    }
    if (record.tipoMovimiento === 'AJUSTE_MANUAL') {
      return { tipo: 'manual', referencia: 'Ajuste manual', id: null };
    }
    return { tipo: null, referencia: '—', id: null };
  }
}
