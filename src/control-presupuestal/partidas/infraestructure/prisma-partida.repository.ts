import { PrismaService } from 'src/prisma/prisma.service';
import { PartidadPresupuestalMapper } from '../common/PartidaPresupuestalMapper';
import { PartidaRepository } from '../domain/partida.repository';
import { PartidaPresupuestal } from '../entities/partida.entity';
import { Injectable } from '@nestjs/common';
import { PartidaSelect } from '../interfaces/select-interfaces';

@Injectable()
export class PrismaPartidaRepository implements PartidaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(partida: PartidaPresupuestal): Promise<PartidaPresupuestal> {
    const persistence = PartidadPresupuestalMapper.toPersistence(partida);

    let recordSaved;

    if (partida.getId() > 0) {
      recordSaved = await this.prisma.partidaPresupuestal.update({
        where: { id: partida.getId() },
        data: {
          ...persistence,
          id: undefined,
        },
      });
    } else {
      recordSaved = await this.prisma.partidaPresupuestal.create({
        data: {
          ...persistence,
          id: undefined,
        },
      });
    }
    return PartidadPresupuestalMapper.toDomain(recordSaved);
  }

  async findById(id: number): Promise<PartidaPresupuestal | null> {
    try {
      const recordFound = await this.prisma.partidaPresupuestal.findUnique({
        where: {
          id,
        },
      });

      if (!recordFound) return null;

      const record = PartidadPresupuestalMapper.toDomain(recordFound);
      return record;
    } catch (error) {
      throw new Error(
        `No se pudo encontrar la partida con ID ${id}. Posiblemente no existe.`,
      );
    }
  }

  async findAll(): Promise<PartidaPresupuestal[]> {
    try {
      const records = await this.prisma.partidaPresupuestal.findMany();
      return PartidadPresupuestalMapper.toDomainList(records);
    } catch (error) {
      throw new Error(`No se pudo encontrar los registros de partida.`);
    }
  }

  async findAllSelect(): Promise<Array<PartidaSelect>> {
    try {
      const records = await this.prisma.partidaPresupuestal.findMany({
        where: {
          estado: true,
        },
        select: {
          id: true,
          nombre: true,
          creadoEn: true,
          presupuestos: {
            select: {
              montoDisponible: true,
            },
          },
        },
      });

      return records;
    } catch (error) {
      throw new Error(`No se pudo encontrar los registros de partida.`);
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await this.prisma.partidaPresupuestal.delete({ where: { id } });
    } catch (error) {
      throw new Error(
        `No se pudo eliminar la partida con ID ${id}. Posiblemente no existe.`,
      );
    }
  }

  async update(partida: PartidaPresupuestal): Promise<PartidaPresupuestal> {
    try {
      const record = await this.prisma.partidaPresupuestal.update({
        where: {
          id: partida.getId(),
        },
        data: {
          ...partida,
        },
      });

      return PartidadPresupuestalMapper.toDomain(record);
    } catch (error) {
      throw new Error(
        `No se pudo actualizar la partida con ID ${partida.getId()}. Posiblemente no existe.`,
      );
    }
  }
}
