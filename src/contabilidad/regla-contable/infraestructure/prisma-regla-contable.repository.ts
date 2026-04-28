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

    // CREATE
    if (!entity.getId()) {
      const created = await prismaClient.reglaContable.create({
        data: ReglaContableMapper.toCreate(entity),
      });

      return ReglaContableMapper.toDomain(created);
    }

    // UPDATE
    const updated = await prismaClient.reglaContable.update({
      where: { id: entity.getId() },
      data: ReglaContableMapper.toUpdate(entity),
    });

    return ReglaContableMapper.toDomain(updated);
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

    const payload = ReglaContableMapper.toUpdate(entity);

    console.log('[ReglaContableRepository.update] id=', entity.getId());
    console.log(
      '[ReglaContableRepository.update] payload=',
      JSON.stringify(payload, null, 2),
    );

    const record = await prismaClient.reglaContable.update({
      where: { id: entity.getId() },
      data: payload,
    });

    console.log(
      '[ReglaContableRepository.update] record=',
      JSON.stringify(record, null, 2),
    );

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

  async findByContext(
    params: {
      origen: OrigenAsientoContable;
      clasificacion?: ClasificacionAdmin;
      motivo?: MotivoMovimiento;
      metodoPago?: MetodoPago;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ReglaContable[]> {
    const prismaClient = tx ?? this.prisma;

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
      where.OR = [{ metodoPago: params.metodoPago }, { metodoPago: null }];
    }

    const records = await prismaClient.reglaContable.findMany({
      where,
      orderBy: { prioridad: 'asc' },
    });

    return records.map((r) => ReglaContableMapper.toDomain(r));
  }
}
