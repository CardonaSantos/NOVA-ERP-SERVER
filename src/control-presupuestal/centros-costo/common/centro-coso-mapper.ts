import { Prisma, CentroCosto as PrismaCentroCosto } from '@prisma/client';
import { CentroCosto } from '../entities/centros-costo.entity';

type CentroCostoWithRelations =
  | PrismaCentroCosto
  | Prisma.CentroCostoGetPayload<{
      include: {
        compras: true;
        presupuestos: true;
        requisiciones: true;
        sucursal: true;
      };
    }>;

export class CentroCostoMapper {
  static toDomain(
    raw: PrismaCentroCosto | CentroCostoWithRelations,
  ): CentroCosto {
    if (!raw) {
      throw new Error('No se puede transformar un registro null');
    }

    const newInstance = new CentroCosto(
      raw.id,
      raw.codigo,
      raw.nombre,
      raw.activo,
      raw.sucursalId,
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

    return newInstance;
  }

  static toPersistence(
    entity: CentroCosto,
  ): Prisma.CentroCostoUncheckedCreateInput {
    if (!entity) {
      throw new Error('No se puede transformar una entidad null');
    }

    return {
      id: entity.getId(),
      nombre: entity.getNombre(),
      codigo: entity.getCodigo(),
      sucursalId: entity.getSucursalId(),
      activo: entity.getEstado(),
    };

    // =================================================================
    // ¿CÓMO MANEJAR RELACIONES OPCIONALES?
    // Si la entidad PartidaPresupuestal necesitara tener sus Categorias dentro,
    // validaríamos si vienen en el objeto 'raw' de Prisma.
    // =================================================================

    // if ('categorias' in raw && raw.categorias) {
    //   const categoriasDominio = raw.categorias.map(cat => CategoriaMapper.toDomain(cat));
    //   partida.asignarCategorias(categoriasDominio); // Método en tu entidad de dominio
    // }
  }

  static toDomainList(rawList: Array<PrismaCentroCosto>): Array<CentroCosto> {
    return rawList.map((rl) => this.toDomain(rl));
  }
}
