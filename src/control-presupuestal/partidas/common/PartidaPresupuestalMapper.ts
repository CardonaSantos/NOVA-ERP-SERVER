import {
  PartidaPresupuestal,
  Prisma,
  PartidaPresupuestal as PrismaPartida,
} from '@prisma/client';
import { PartidaPresupuestal as PartidaPresupuestalEntity } from '../entities/partida.entity';
import { report } from 'process';

type PrismaPartidaConRelaciones = Prisma.PartidaPresupuestalGetPayload<{
  include: {
    categorias: true;
    productos: true;
    presupuestos: true;
  };
}>;

export class PartidadPresupuestalMapper {
  /**
   * RETORNA A CLASE DE DOMINIO
   * @param raw Registro Prisma Crudo
   * @returns LA ENTIDAD PARTIDA
   */
  static toDomain(
    raw: PrismaPartida | PrismaPartidaConRelaciones,
  ): PartidaPresupuestalEntity {
    if (!raw) {
      throw new Error('No se puede mapear este objeto nulo');
    }

    const partida = new PartidaPresupuestalEntity(
      raw.id,
      raw.codigo,
      raw.nombre,
      raw.descripcion,
      raw.estado,
    );

    // =================================================================
    // ¿CÓMO MANEJAR RELACIONES OPCIONALES?
    // Si la entidad PartidaPresupuestal necesitara tener sus Categorias dentro,
    // validaríamos si vienen en el objeto 'raw' de Prisma.
    // =================================================================

    // if ('categorias' in raw && raw.categorias) {
    //   const categoriasDominio = raw.categorias.map(cat => CategoriaMapper.toDomain(cat));
    //   partida.asignarCategorias(categoriasDominio); // Método en tu entidad de dominio
    // }

    return partida;
  }

  /**
   * DE ENTIDAD A DATO PERSISTENTE
   * @param entity ENTIDAD -> PRISMA
   * @returns DATO PARA PRISMA
   */
  static toPersistence(
    entity: PartidaPresupuestalEntity,
  ): Prisma.PartidaPresupuestalUncheckedCreateInput {
    return {
      id: entity.getId(),
      codigo: entity.getCodigo(),
      nombre: entity.getNombre(),
      descripcion: entity.getDescripcion(),
      estado: entity.getEstado(),
    };
  }

  /**
   * EXTRA: MAPEO DE PRISMA ARRAY A ENTIDAD
   * @param rawList
   * @returns
   */
  static toDomainList(
    rawList: Array<PrismaPartida>,
  ): Array<PartidaPresupuestalEntity> {
    return rawList.map((r) => this.toDomain(r));
  }
}
