import { Injectable } from '@nestjs/common';
import { PeriodoRepository } from '../domain/periodo.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PeriodoPresupuestal } from '../entities/periodo.entity';
import { PeriodoMapper } from '../common/periodo-mappers';

@Injectable()
export class PrismaPeriodoPresupuestal implements PeriodoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(periodo: PeriodoPresupuestal): Promise<PeriodoPresupuestal> {
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
  }

  async delete(id: number) {
    await this.prisma.periodoPresupuestal.delete({
      where: {
        id,
      },
    });
  }

  async findAll(): Promise<Array<PeriodoPresupuestal>> {
    const records = await this.prisma.periodoPresupuestal.findMany({});
    return PeriodoMapper.toDomainList(records);
  }
  async findById(id: number): Promise<PeriodoPresupuestal> {
    const record = await this.prisma.periodoPresupuestal.findUnique({
      where: {
        id,
      },
    });

    return PeriodoMapper.toDomain(record);
  }
}
