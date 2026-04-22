import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { CuentaContableRepository } from '../domain/cuenta-contable.repository';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { CuentaContableMapper } from '../common/mappers';

@Injectable()
export class PrismaCuentaContableRepository
  implements CuentaContableRepository
{
  private readonly logger = new Logger(PrismaCuentaContableRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // SAVE (CREATE / UPSERT)
  async save(
    entity: CuentaContable,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaContable> {
    const prismaClient = tx ?? this.prisma;

    const data = CuentaContableMapper.toPersistence(entity);

    const id = entity.getId();

    const record = await prismaClient.cuentaContable.upsert({
      where: { id: id || 0 },
      create: data,
      update: {
        ...data,
        id: undefined,
      },
    });

    return CuentaContableMapper.toDomain(record);
  }

  // UPDATE
  async update(
    entity: CuentaContable,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaContable> {
    const prismaClient = tx ?? this.prisma;

    const record = await prismaClient.cuentaContable.update({
      where: {
        id: entity.getId(),
      },
      data: {
        ...CuentaContableMapper.toPersistence(entity),
      },
    });

    return CuentaContableMapper.toDomain(record);
  }

  // FIND BY ID
  async findById(id: number): Promise<CuentaContable | null> {
    const record = await this.prisma.cuentaContable.findUnique({
      where: { id },
    });

    if (!record) return null;

    return CuentaContableMapper.toDomain(record);
  }

  // FIND ALL
  async findAll(): Promise<Array<CuentaContable>> {
    const records = await this.prisma.cuentaContable.findMany({
      orderBy: {
        codigo: 'asc',
      },
    });

    return CuentaContableMapper.toDomainList(records);
  }

  // FIND BY CODIGO
  async findByCodigo(codigo: string): Promise<CuentaContable | null> {
    const record = await this.prisma.cuentaContable.findUnique({
      where: { codigo },
    });

    if (!record) return null;

    return CuentaContableMapper.toDomain(record);
  }

  // DELETE (SOFT DELETE)
  async delete(id: number, tx?: Prisma.TransactionClient): Promise<void> {
    const prismaClient = tx ?? this.prisma;

    await prismaClient.cuentaContable.update({
      where: { id },
      data: {
        activa: false,
      },
    });
  }
}
