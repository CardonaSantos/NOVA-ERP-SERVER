import { Injectable, Logger } from '@nestjs/common';
import {
  EstadoAsientoContable,
  OrigenAsientoContable,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

import { AsientoContableRepository } from '../domain/domain.repository';
import { AsientoContable } from '../entities/asiento-contable.entity';
import { AsientoContableMapper } from '../common/map';
import {
  AsientoContableLinea,
  AsientoContableResponse,
} from '../common/types-maps';
import { parseDecimal } from 'src/utils/parseDecimal';

@Injectable()
export class PrismaAsientoContableRepository
  implements AsientoContableRepository
{
  constructor(private readonly prisma: PrismaService) {}
  private readonly logger = new Logger(PrismaAsientoContableRepository.name);

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

  // asiento-contable.service.ts
  async findAll(params: {
    page: number;
    pageSize: number;
    estado?: EstadoAsientoContable;
    origen?: OrigenAsientoContable;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }): Promise<{
    data: AsientoContableResponse[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  }> {
    const { page, pageSize, estado, origen, sortBy, sortOrder } = params;

    const where: Prisma.AsientoContableWhereInput = {};

    if (estado) {
      where.estado = estado;
    }
    if (origen) {
      where.origen = origen;
    }

    const total = await this.prisma.asientoContable.count({ where });

    const records = await this.prisma.asientoContable.findMany({
      where,
      include: { lineas: true },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const data = records.map((r) => {
      const totalDebe = r.lineas.reduce(
        (acc, item) => acc + parseDecimal(item.debe),
        0,
      );

      const totalHaber = r.lineas.reduce(
        (acc, item) => acc + parseDecimal(item.haber),
        0,
      );

      return {
        id: r.id,
        fecha: r.fecha.toISOString(),
        descripcion: r.descripcion,
        referencia: r.referencia,
        origen: r.origen,
        origenId: r.origenId,
        estado: r.estado,
        sucursalId: r.sucursalId,
        usuarioId: r.usuarioId,
        totalDebe,
        totalHaber,
        creadoEn: r.creadoEn.toISOString(),
        actualizadoEn: r.actualizadoEn.toISOString(),
        lineas: r.lineas.map((rl) => ({
          id: rl.id,
          asientoContableId: rl.asientoContableId,
          cuentaContableId: rl.cuentaContableId,
          debe: parseDecimal(rl.debe),
          haber: parseDecimal(rl.haber),
          descripcion: rl.descripcion,
          centroCostoId: rl.centroCostoId,
          partidaPresupuestalId: rl.partidaPresupuestalId,
          proveedorId: rl.proveedorId,
          clienteId: rl.clienteId,
          productoId: rl.productoId,
          ventaId: rl.ventaId,
          compraId: rl.compraId,
          movimientoFinancieroId: rl.movimientoFinancieroId,
          cxpDocumentoId: rl.cxpDocumentoId,
          cxpPagoId: rl.cxpPagoId,
          abonoCreditoId: rl.abonoCreditoId,
          historialStockId: rl.historialStockId,
          creadoEn: rl.creadoEn.toISOString(),
          actualizadoEn: rl.actualizadoEn.toISOString(),
        })),
      };
    });
    this.logger.log(`where recibido:\n${JSON.stringify(where, null, 2)}`);
    return {
      data,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
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
