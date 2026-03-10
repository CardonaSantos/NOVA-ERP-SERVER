import { TipoPlantillaLegal } from '@prisma/client';

export class PlantillaLegalCredito {
  id: number;
  tipo: TipoPlantillaLegal;
  nombre: string;
  contenido: string;
  version: string;
  activa: boolean;
  creadoEn: Date;
  actualizadoEn: Date;

  constructor(partial: Partial<PlantillaLegalCredito>) {
    Object.assign(this, partial);
  }

  // Rehidratación desde Prisma
  static fromPrisma(raw: {
    id: number;
    tipo: TipoPlantillaLegal;
    nombre: string;
    contenido: string;
    version: string;
    activa: boolean;
    creadoEn: Date;
    actualizadoEn: Date;
  }): PlantillaLegalCredito {
    return new PlantillaLegalCredito({
      id: raw.id,
      tipo: raw.tipo,
      nombre: raw.nombre,
      contenido: raw.contenido,
      version: raw.version,
      activa: raw.activa,
      creadoEn: raw.creadoEn,
      actualizadoEn: raw.actualizadoEn,
    });
  }

  // Para persistir (crear)
  toPrismaCreate(): {
    tipo: TipoPlantillaLegal;
    nombre: string;
    contenido: string;
    version: string;
    activa: boolean;
  } {
    return {
      tipo: this.tipo,
      nombre: this.nombre,
      contenido: this.contenido,
      version: this.version,
      activa: this.activa,
    };
  }

  // Para persistir (actualizar)
  toPrismaUpdate(): Partial<{
    tipo: TipoPlantillaLegal;
    nombre: string;
    contenido: string;
    version: string;
    activa: boolean;
  }> {
    return {
      ...(this.tipo !== undefined && { tipo: this.tipo }),
      ...(this.nombre !== undefined && { nombre: this.nombre }),
      ...(this.contenido !== undefined && { contenido: this.contenido }),
      ...(this.version !== undefined && { version: this.version }),
      ...(this.activa !== undefined && { activa: this.activa }),
    };
  }
}
