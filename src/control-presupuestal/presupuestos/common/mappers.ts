import { Prisma, Presupuesto as PrismaPresupuesto } from '@prisma/client';
import { Presupuesto } from '../entities/presupuesto.entity';
type PrismaPresupuestoWithRelations = Prisma.PresupuestoGetPayload<{
  include: {
    centroCosto: true;
    movimientos: true;
    partida: true;
    periodo: true;
  };
}>;

export class PresupuestoMapper {
  static toDomain(
    raw: PrismaPresupuesto | PrismaPresupuestoWithRelations,
  ): Presupuesto {
    // La entidad calculará su propio disponible basándose en los otros tres montos.
    // Esto asegura que si alguien modificó la DB a mano y la descuadró,
    // la aplicación la volverá a cuadrar al cargarla en memoria.
    return new Presupuesto(
      raw.id,
      raw.centroCostoId,
      raw.periodoId,
      raw.partidaId,
      raw.montoAsignado,
      raw.montoComprometido,
      raw.montoEjercido,
    );
  }

  /**
   * Convierte de Dominio a Base de Datos
   */
  static toPersistence(
    entity: Presupuesto,
  ): Prisma.PresupuestoUncheckedCreateInput {
    return {
      id: entity.getId() || undefined,
      centroCostoId: entity.getCentroCostoId(),
      periodoId: entity.getPeriodoId(),
      partidaId: entity.getPartidaId(),
      montoAsignado: entity.getMontoAsignado(),
      montoComprometido: entity.getMontoComprometido(),
      montoEjercido: entity.getMontoEjercido(),

      // Le pedimos a la entidad su cálculo exacto
      // y lo guardamos como un campo físico en Prisma.
      montoDisponible: entity.montoDisponible,
    };
  }

  static toDomainList(rawList: PrismaPresupuesto[]): Presupuesto[] {
    return rawList.map((raw) => this.toDomain(raw));
  }
}
