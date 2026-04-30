import { AsientoContable } from '../entities/asiento-contable.entity';
import { AsientoContableLinea } from '../entities/asiento-contable-linea.entity';

import { Prisma, OrigenAsientoContable as PrismaOrigen } from '@prisma/client';
function mapOrigenToPrisma(origen: PrismaOrigen): PrismaOrigen {
  return origen;
}

export class AsientoContableMapper {
  static toDomain(raw: any): AsientoContable {
    const asiento = new AsientoContable(
      raw.id,
      raw.fecha,
      raw.descripcion,
      raw.origen,
      raw.origenId,
      raw.estado,
    );

    const lineas = (raw.lineas || []).map(
      (l) =>
        new AsientoContableLinea(
          l.cuentaContableId,
          Number(l.debe),
          Number(l.haber),
          l.descripcion,
        ),
    );

    asiento.hydrateLineas(lineas); // 👈 en vez de agregarLinea

    return asiento;
  }

  static toPersistence(entity: AsientoContable) {
    return {
      fecha: entity.getFecha(),
      descripcion: entity.getDescripcion(),

      origen: mapOrigenToPrisma(entity.getOrigen()),

      origenId: entity.getOrigenId() ?? null,

      estado: entity.getEstado(),

      lineas: {
        create: entity.getLineas().map((l) => ({
          cuentaContableId: l.getCuentaContableId(),
          debe: l.getDebe(),
          haber: l.getHaber(),
          descripcion: l.getDescripcion() ?? null,
        })),
      },
    };
  }
}
