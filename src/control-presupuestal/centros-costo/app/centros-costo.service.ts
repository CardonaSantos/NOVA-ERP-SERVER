import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CENTRO_COSTO_REPOSITORY,
  CentroCostoRepository,
} from '../domain/centro-costo.repository';
import { CreateCentroCostoDto } from '../dto/create-centros-costo.dto';
import { UpdateCentroCostoDto } from '../dto/update-centros-costo.dto';
import { CentroCosto } from '../entities/centros-costo.entity';
import { ErrorHandler } from 'src/utils/error_handler';

@Injectable()
export class CentrosCostoService {
  private readonly logger = new Logger(CentrosCostoService.name);

  constructor(
    @Inject(CENTRO_COSTO_REPOSITORY)
    private readonly repoCentroCosto: CentroCostoRepository,
  ) {}

  async crear(dto: CreateCentroCostoDto): Promise<CentroCosto> {
    try {
      const entity = new CentroCosto(
        0,
        dto.codigo,
        dto.nombre,
        true,
        dto.sucursalId,
      );

      return await this.repoCentroCosto.save(entity);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'crear centro costo',
        codigo: dto.codigo,
        sucursalId: dto.sucursalId,
      });
    }
  }

  async obtenerTodos(): Promise<CentroCosto[]> {
    try {
      return await this.repoCentroCosto.findAll();
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async obtenerPorId(id: number): Promise<CentroCosto> {
    try {
      const centroCosto = await this.repoCentroCosto.findById(id);
      if (!centroCosto) {
        throw new NotFoundException(
          `Centro de Costo con ID ${id} no encontrado`,
        );
      }
      return centroCosto;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async actualizar(
    id: number,
    dto: UpdateCentroCostoDto,
  ): Promise<CentroCosto> {
    const entity = await this.obtenerPorId(id);

    try {
      if (dto.nombre) entity.rename(dto.nombre);
      if (dto.sucursalId) entity.vinculateSucursal(dto.sucursalId);

      if (dto.activo === false) entity.deactivate();
      if (dto.activo === true) entity.activate();

      return await this.repoCentroCosto.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async eliminar(id: number): Promise<void> {
    try {
      await this.obtenerPorId(id);
      await this.repoCentroCosto.delete(id);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }
}
