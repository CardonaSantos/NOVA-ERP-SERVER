import { PrismaService } from 'src/prisma/prisma.service';
import { CentroCostoRepository } from '../domain/centro-costo.repository';
import { Injectable, Logger } from '@nestjs/common';
import { CentroCosto } from '../entities/centros-costo.entity';
import { CentroCostoMapper } from '../common/centro-coso-mapper';

@Injectable()
export class PrismaCentroCostoRepository implements CentroCostoRepository {
  private readonly logger = new Logger(PrismaCentroCostoRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async save(centroCosto: CentroCosto): Promise<CentroCosto> {
    const data = CentroCostoMapper.toPersistence(centroCosto);
    const id = centroCosto.getId();

    const record = await this.prisma.centroCosto.upsert({
      where: { id: id || 0 },
      create: data,
      update: { ...data, id: undefined },
    });

    return CentroCostoMapper.toDomain(record);
  }
  async findById(id: number): Promise<CentroCosto | null> {
    const recordFound = await this.prisma.centroCosto.findUnique({
      where: { id },
    });

    if (!recordFound) return null;

    return CentroCostoMapper.toDomain(recordFound);
  }

  async delete(id: number): Promise<void> {
    try {
      await this.prisma.centroCosto.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Error al eliminar Centro de Costo ${id}: ${error.message}`,
      );
      throw new Error(`No se pudo eliminar el recurso con ID ${id}`);
    }
  }

  async findAll(): Promise<Array<CentroCosto>> {
    try {
      const records = await this.prisma.centroCosto.findMany({
        where: {},
      });

      return CentroCostoMapper.toDomainList(records);
    } catch (error) {
      throw new Error(error);
    }
  }

  async update(centroCosto: CentroCosto): Promise<CentroCosto> {
    try {
      const recordUpdated = await this.prisma.centroCosto.update({
        where: {
          id: centroCosto.getId(),
        },
        data: {
          ...CentroCostoMapper.toPersistence(centroCosto),
        },
      });

      return CentroCostoMapper.toDomain(recordUpdated);
    } catch (error) {
      throw new Error(error);
    }
  }
}
