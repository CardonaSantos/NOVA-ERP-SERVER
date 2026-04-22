import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
  Prisma,
} from '@prisma/client';

import { ReglaContableRepository } from '../domain/regla-contable.repository';

import { ReglaContable } from '../entities/regla-contable.entity';
import { ReglaContableMapper } from '../common/mappers';

@Injectable()
export class PrismaReglaContableRepository implements ReglaContableRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    entity: ReglaContable,
    tx?: Prisma.TransactionClient,
  ): Promise<ReglaContable> {
    const prismaClient = tx ?? this.prisma;

    const data = ReglaContableMapper.toPersistence(entity);

    const record = await prismaClient.reglaContable.upsert({
      where: { id: entity.getId() || 0 },
      create: data,
      update: { ...data, id: undefined },
    });

    return ReglaContableMapper.toDomain(record);
  }

  async findById(id: number): Promise<ReglaContable | null> {
    const record = await this.prisma.reglaContable.findUnique({
      where: { id },
    });

    if (!record) return null;

    return ReglaContableMapper.toDomain(record);
  }

  async findAll(): Promise<ReglaContable[]> {
    const records = await this.prisma.reglaContable.findMany({
      where: { activa: true },
      orderBy: { prioridad: 'asc' },
    });

    return records.map(ReglaContableMapper.toDomain);
  }

  async update(
    entity: ReglaContable,
    tx?: Prisma.TransactionClient,
  ): Promise<ReglaContable> {
    const prismaClient = tx ?? this.prisma;

    const record = await prismaClient.reglaContable.update({
      where: { id: entity.getId() },
      data: ReglaContableMapper.toPersistence(entity),
    });

    return ReglaContableMapper.toDomain(record);
  }

  async delete(id: number, tx?: Prisma.TransactionClient): Promise<void> {
    const prismaClient = tx ?? this.prisma;

    await prismaClient.reglaContable.update({
      where: { id },
      data: { activa: false },
    });
  }

  // 🔥 MÉTODO CLAVE
  //   async findByContext(params: {
  //     origen: OrigenAsientoContable;
  //     clasificacion?: ClasificacionAdmin;
  //     motivo?: MotivoMovimiento;
  //     metodoPago?: MetodoPago;
  //   }): Promise<ReglaContable[]> {
  //     const records = await this.prisma.reglaContable.findMany({
  //       where: {
  //         origen: params.origen,
  //         activa: true,

  //         OR: [
  //           { clasificacion: params.clasificacion ?? undefined },
  //           { clasificacion: null },
  //         ],

  //         AND: [
  //           {
  //             OR: [{ motivo: params.motivo ?? undefined }, { motivo: null }],
  //           },
  //           {
  //             OR: [
  //               { metodoPago: params.metodoPago ?? undefined },
  //               { metodoPago: null },
  //             ],
  //           },
  //         ],
  //       },
  //       orderBy: {
  //         prioridad: 'asc',
  //       },
  //     });

  //     return records.map(ReglaContableMapper.toDomain);
  //   }
  async findByContext(params: {
    origen: OrigenAsientoContable;
    clasificacion?: ClasificacionAdmin;
    motivo?: MotivoMovimiento;
    metodoPago?: MetodoPago;
  }): Promise<ReglaContable[]> {
    const where: Prisma.ReglaContableWhereInput = {
      origen: params.origen,
      activa: true,
    };

    if (params.clasificacion !== undefined) {
      where.clasificacion = params.clasificacion;
    }

    if (params.motivo !== undefined) {
      where.motivo = params.motivo;
    }

    if (params.metodoPago !== undefined) {
      where.metodoPago = params.metodoPago;
    }

    const records = await this.prisma.reglaContable.findMany({
      where,
      orderBy: { prioridad: 'asc' },
    });

    return records.map((r) => ReglaContableMapper.toDomain(r));
  }
}
