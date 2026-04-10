import { Inject, Injectable } from '@nestjs/common';
import { CreatePeriodoDto } from '../dto/create-periodo.dto';
import { UpdatePeriodoDto } from '../dto/update-periodo.dto';
import {
  PERIODO_PRESUPUESTAL_REPOSITORY,
  PeriodoRepository,
} from '../domain/periodo.repository';
import { EstadoPeriodo, PeriodoPresupuestal } from '../entities/periodo.entity';
import { ErrorHandler } from 'src/utils/error_handler';

@Injectable()
export class PeriodosService {
  constructor(
    @Inject(PERIODO_PRESUPUESTAL_REPOSITORY)
    private readonly repoPeriodo: PeriodoRepository,
  ) {}

  async save(dto: CreatePeriodoDto) {
    try {
      const entity = new PeriodoPresupuestal(
        0,
        dto.nombre,
        dto.fechaInicio,
        dto.fechaFin,
        EstadoPeriodo.ABIERTO,
      );

      return await this.repoPeriodo.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async update(id: number, dto: UpdatePeriodoDto) {
    try {
      const entity = await this.findOne(id);

      if (dto.nombre) entity.rename(dto.nombre);
      if (dto.fechaInicio && dto.fechaFin)
        entity.changeRange(dto.fechaInicio, dto.fechaFin);

      return await this.repoPeriodo.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async findAll() {
    try {
      const records = await this.repoPeriodo.findAll();
      return records;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async findOne(id: number): Promise<PeriodoPresupuestal> {
    try {
      const record = await this.repoPeriodo.findById(id);
      return record;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async delete(id: number) {
    try {
      return await this.repoPeriodo.delete(id);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }
}
