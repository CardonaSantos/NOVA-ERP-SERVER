import { Injectable } from '@nestjs/common';
import { PeriodoRepository } from '../domain/periodo.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PeriodoPresupuestal } from '../entities/periodo.entity';
import { PeriodoMapper } from '../common/periodo-mappers';

@Injectable()
export class PrismaPeriodoPresupuestal implements PeriodoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(periodo: PeriodoPresupuestal): Promise<PeriodoPresupuestal> {
    try {
      const data = PeriodoMapper.toPersistence(periodo);
      const id = periodo.getId();
      const record = await this.prisma.periodoPresupuestal.upsert({
        where: {
          id,
        },
        create: {
          ...data,
        },
        update: {
          ...data,
        },
      });

      return PeriodoMapper.toDomain(record);
    } catch (error) {
      throw new Error(error);
    }
  }

  async delete(id: number) {
    try {
      await this.prisma.periodoPresupuestal.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(error);
    }
  }

  async findAll(): Promise<Array<PeriodoPresupuestal>> {
    try {
      const records = await this.prisma.periodoPresupuestal.findMany({});
      return PeriodoMapper.toDomainList(records);
    } catch (error) {
      throw new Error(error);
    }
  }
  async findById(id: number): Promise<PeriodoPresupuestal> {
    try {
      const record = await this.prisma.periodoPresupuestal.findUnique({
        where: {
          id,
        },
      });

      return PeriodoMapper.toDomain(record);
    } catch (error) {
      throw new Error(error);
    }
  }
}
