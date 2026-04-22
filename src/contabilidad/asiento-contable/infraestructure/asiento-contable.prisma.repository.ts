import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

import { AsientoContableRepository } from '../domain/domain.repository';
import { AsientoContable } from '../entities/asiento-contable.entity';
import { AsientoContableMapper } from '../common/map';

@Injectable()
export class PrismaAsientoContableRepository
  implements AsientoContableRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(
    entity: AsientoContable,
    tx?: Prisma.TransactionClient,
  ): Promise<AsientoContable> {
    const prismaClient = tx ?? this.prisma;

    const data = AsientoContableMapper.toPersistence(entity);

    const record = await prismaClient.asientoContable.create({
      data,
      include: {
        lineas: true,
      },
    });

    return AsientoContableMapper.toDomain(record);
  }

  async findById(id: number): Promise<AsientoContable | null> {
    const record = await this.prisma.asientoContable.findUnique({
      where: { id },
      include: { lineas: true },
    });

    if (!record) return null;

    return AsientoContableMapper.toDomain(record);
  }

  async findAll(): Promise<AsientoContable[]> {
    const records = await this.prisma.asientoContable.findMany({
      include: { lineas: true },
    });

    return records.map(AsientoContableMapper.toDomain);
  }

  async update(
    entity: AsientoContable,
    tx?: Prisma.TransactionClient,
  ): Promise<AsientoContable> {
    throw new Error('No se permite actualizar asientos contables');
  }

  async delete(id: number, tx?: Prisma.TransactionClient): Promise<void> {
    throw new Error('No se permite eliminar asientos contables');
  }
}
