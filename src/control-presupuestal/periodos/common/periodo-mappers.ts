import { Prisma, PeriodoPresupuestal as PrismaPeriodo } from '@prisma/client';
import { EstadoPeriodo, PeriodoPresupuestal } from '../entities/periodo.entity';
import { dateUtils } from 'src/utils/dateUtils';

type PeriodoPresupuestalWithRelations = Prisma.PeriodoPresupuestalGetPayload<{
  include: {
    presupuestos: true;
  };
}>;

export class PeriodoMapper {
  static toDomain(
    raw: PrismaPeriodo | PeriodoPresupuestalWithRelations,
  ): PeriodoPresupuestal {
    if (!raw) {
      throw new Error('Registro crudo no válido');
    }

    // if ('categorias' in raw && raw.categorias) {
    //   const categoriasDominio = raw.categorias.map(cat => CategoriaMapper.toDomain(cat));
    //   partida.asignarCategorias(categoriasDominio); // Método en tu entidad de dominio
    // }

    return new PeriodoPresupuestal(
      raw.id,
      raw.nombre,
      raw.fechaInicio.toISOString(),
      raw.fechaFin.toISOString(),
      raw.estado as EstadoPeriodo,
    );
  }

  static toPersistence(
    entity: PeriodoPresupuestal,
  ): Prisma.PeriodoPresupuestalUncheckedCreateInput {
    return {
      id: entity.getId(),
      nombre: entity.getNombre(),
      fechaInicio: dateUtils(entity.getFechaInicio()).toDate(),
      fechaFin: dateUtils(entity.getFin()).toDate(),
      estado: entity.getEstado(),
    };
  }

  static toDomainList(
    raw: Array<PrismaPeriodo | PeriodoPresupuestalWithRelations>,
  ) {
    return raw.map((r) => this.toDomain(r));
  }
}
