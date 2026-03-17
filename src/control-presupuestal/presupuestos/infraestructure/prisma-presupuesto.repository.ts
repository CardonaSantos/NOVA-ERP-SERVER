import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresupuestoRepository } from '../domain/presupuesto.repository';
import { Presupuesto } from '../entities/presupuesto.entity';
import { PresupuestoMapper } from '../common/mappers';

@Injectable()
export class PrismaPresupuestoRepository implements PresupuestoRepository {
  private readonly logger = new Logger(PrismaPresupuestoRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(presupuesto: Presupuesto): Promise<Presupuesto> {
    try {
      const data = PresupuestoMapper.toPersistence(presupuesto);

      const record = await this.prisma.presupuesto.upsert({
        where: { id: presupuesto.getId() || 0 },
        create: data,
        update: { ...data, id: undefined }, // Protegemos el ID para que no se actualice
      });

      return PresupuestoMapper.toDomain(record);
    } catch (error) {
      this.logger.error(
        `Error al guardar Presupuesto: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findById(id: number): Promise<Presupuesto | null> {
    try {
      const record = await this.prisma.presupuesto.findUnique({
        where: { id },
      });

      if (!record) return null;

      return PresupuestoMapper.toDomain(record);
    } catch (error) {
      this.logger.error(
        `Error al buscar Presupuesto por ID ${id}: ${error.message}`,
      );
      throw error;
    }
  }

  async findByLlaveCompuesta(
    periodoId: number,
    centroCostoId: number,
    partidaId: number,
  ): Promise<Presupuesto | null> {
    try {
      const record = await this.prisma.presupuesto.findFirst({
        where: {
          periodoId,
          centroCostoId,
          partidaId,
        },
      });

      if (!record) return null;

      return PresupuestoMapper.toDomain(record);
    } catch (error) {
      this.logger.error(`Error en findByLlaveCompuesta: ${error.message}`);
      throw error;
    }
  }

  async findAll(): Promise<Presupuesto[]> {
    try {
      const records = await this.prisma.presupuesto.findMany();
      return PresupuestoMapper.toDomainList(records);
    } catch (error) {
      this.logger.error(`Error al listar Presupuestos: ${error.message}`);
      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await this.prisma.presupuesto.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Error al eliminar Presupuesto ${id}: ${error.message}`,
      );
      throw error;
    }
  }
}
