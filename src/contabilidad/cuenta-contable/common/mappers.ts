import {
  CuentaContable as PrismaCuentaContable,
  Prisma,
  TipoCuentaContable as PrismaTipo,
  NaturalezaCuentaContable as PrismaNaturaleza,
} from '@prisma/client';

import { CuentaContable } from '../entities/cuenta-contable.entity';
import { NaturalezaCuentaContable, TipoCuentaContable } from '../types/types';

export class CuentaContableMapper {
  // DOMAIN → PERSISTENCE
  static toPersistence(
    entity: CuentaContable,
  ): Prisma.CuentaContableUncheckedCreateInput {
    return {
      id: entity.getId() || undefined,
      codigo: entity.getCodigo(),
      nombre: entity.getNombre(),

      tipo: this.mapTipoToPrisma(entity.getTipo()),
      naturaleza: this.mapNaturalezaToPrisma(entity.getNaturaleza()),

      permiteMovimiento: entity.permiteMovimientos(),
      activa: entity.estaActiva(),

      cuentaPadreId: entity.getPadreId() ?? null,
    };
  }

  // PERSISTENCE → DOMAIN
  static toDomain(raw: PrismaCuentaContable): CuentaContable {
    if (!raw) {
      throw new Error('No se puede mapear CuentaContable null');
    }

    return new CuentaContable(
      raw.id,
      raw.codigo,
      raw.nombre,
      this.mapTipoToDomain(raw.tipo),
      this.mapNaturalezaToDomain(raw.naturaleza),
      raw.permiteMovimiento,
      raw.activa,
      raw.cuentaPadreId ?? undefined,
    );
  }

  static toDomainList(rawList: PrismaCuentaContable[]): CuentaContable[] {
    return rawList.map(this.toDomain.bind(this));
  }

  // ENUM MAPPERS

  private static mapTipoToPrisma(tipo: TipoCuentaContable): PrismaTipo {
    switch (tipo) {
      case TipoCuentaContable.ACTIVO:
        return PrismaTipo.ACTIVO;
      case TipoCuentaContable.PASIVO:
        return PrismaTipo.PASIVO;
      case TipoCuentaContable.PATRIMONIO:
        return PrismaTipo.PATRIMONIO;
      case TipoCuentaContable.INGRESO:
        return PrismaTipo.INGRESO;
      case TipoCuentaContable.GASTO:
        return PrismaTipo.GASTO;
      case TipoCuentaContable.COSTO:
        return PrismaTipo.COSTO;
      default:
        throw new Error('TipoCuentaContable inválido');
    }
  }

  private static mapTipoToDomain(tipo: PrismaTipo): TipoCuentaContable {
    switch (tipo) {
      case PrismaTipo.ACTIVO:
        return TipoCuentaContable.ACTIVO;
      case PrismaTipo.PASIVO:
        return TipoCuentaContable.PASIVO;
      case PrismaTipo.PATRIMONIO:
        return TipoCuentaContable.PATRIMONIO;
      case PrismaTipo.INGRESO:
        return TipoCuentaContable.INGRESO;
      case PrismaTipo.GASTO:
        return TipoCuentaContable.GASTO;
      case PrismaTipo.COSTO:
        return TipoCuentaContable.COSTO;
      default:
        throw new Error('TipoCuentaContable inválido');
    }
  }

  private static mapNaturalezaToPrisma(
    naturaleza: NaturalezaCuentaContable,
  ): PrismaNaturaleza {
    switch (naturaleza) {
      case NaturalezaCuentaContable.DEUDORA:
        return PrismaNaturaleza.DEUDORA;
      case NaturalezaCuentaContable.ACREEDORA:
        return PrismaNaturaleza.ACREEDORA;
      default:
        throw new Error('NaturalezaCuentaContable inválida');
    }
  }

  private static mapNaturalezaToDomain(
    naturaleza: PrismaNaturaleza,
  ): NaturalezaCuentaContable {
    switch (naturaleza) {
      case PrismaNaturaleza.DEUDORA:
        return NaturalezaCuentaContable.DEUDORA;
      case PrismaNaturaleza.ACREEDORA:
        return NaturalezaCuentaContable.ACREEDORA;
      default:
        throw new Error('NaturalezaCuentaContable inválida');
    }
  }
}
