import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresupuestoRepository } from '../domain/presupuesto.repository';
import { Presupuesto } from '../entities/presupuesto.entity';
import { PresupuestoMapper } from '../common/mappers';
import { PresupuestoDetalleView } from '../interfaces/interfaces-view';
import { mapToDetalleView } from '../common/map';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrismaPresupuestoRepository implements PresupuestoRepository {
  private readonly logger = new Logger(PrismaPresupuestoRepository.name);
  private readonly INCLUDE_LISTA = {
    periodo: true,
    partida: true,
    centroCosto: { include: { sucursal: true } },
  };

  // Include profundo para un solo registro (Con todo el historial)
  private readonly INCLUDE_DETALLE = {
    ...this.INCLUDE_LISTA,
    movimientos: {
      include: {
        requisicion: true,
        compra: true,
        usuario: true,
      },
      orderBy: { fechaMovimiento: 'desc' as const },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async save(
    presupuesto: Presupuesto,
    tx?: Prisma.TransactionClient,
  ): Promise<Presupuesto> {
    try {
      const prism = tx ? tx : this.prisma;

      const data = PresupuestoMapper.toPersistence(presupuesto);

      const record = await prism.presupuesto.upsert({
        where: { id: presupuesto.getId() || 0 },
        create: data,
        update: { ...data, id: undefined },
      });

      return PresupuestoMapper.toDomain(record);
    } catch (error) {
      this.logger.error(`Error al guardar Presupuesto: ${error}`, error);
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
      this.logger.error(`Error al buscar Presupuesto por ID ${id}: ${error}`);
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
      this.logger.error(`Error en findByLlaveCompuesta: ${error}`);
      throw error;
    }
  }

  async findAll(): Promise<Presupuesto[]> {
    try {
      const records = await this.prisma.presupuesto.findMany();
      return PresupuestoMapper.toDomainList(records);
    } catch (error) {
      this.logger.error(`Error al listar Presupuestos: ${error}`);
      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await this.prisma.presupuesto.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error al eliminar Presupuesto ${id}: ${error}`);
      throw error;
    }
  }

  async findDetalleById(id: number): Promise<PresupuestoDetalleView | null> {
    const record = await this.prisma.presupuesto.findUnique({
      where: { id },
      include: this.INCLUDE_DETALLE,
    });
    return record ? mapToDetalleView(record) : null;
  }

  async findAllDetalles(): Promise<PresupuestoDetalleView[]> {
    const records = await this.prisma.presupuesto.findMany({
      include: this.INCLUDE_LISTA,
    });
    return records.map((record) => mapToDetalleView(record));
  }

  async findAllSelect() {
    try {
      const records = await this.prisma.presupuesto.findMany({
        where: {
          partida: {
            estado: true,
          },
        },
        select: {
          id: true,
          montoDisponible: true,
          montoComprometido: true,
          partida: {
            select: {
              id: true,
              nombre: true,
            },
          },
          periodo: {
            select: {
              fechaInicio: true,
              fechaFin: true,
            },
          },
        },
      });

      const recordsMapped =
        records.length &&
        records.map((r) => ({
          id: r.id,
          montoDisponible: r.montoDisponible,
          montoComprometido: r.montoComprometido,
          partida: r.partida.nombre,
          partidaId: r.partida.id,
          fechaFin: r.periodo.fechaFin,
          fechaInicio: r.periodo.fechaInicio,
        }));
      return recordsMapped;
    } catch (error) {
      this.logger.error(`Error al listar Presupuestos to Select: ${error}`);
      throw error;
    }
  }
}
