import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UpdatePartidaDto } from '../dto/update-partida.dto';
import {
  PARTIDA_REPOSITORY,
  PartidaRepository,
} from '../domain/partida.repository';
import { PartidaPresupuestal } from '../entities/partida.entity';
import { CreatePartidaPresupuestalDto } from '../dto/create-partida.dto';

@Injectable()
export class PartidasService {
  private readonly logger = new Logger(PartidasService.name);

  constructor(
    @Inject(PARTIDA_REPOSITORY)
    private readonly repoPartida: PartidaRepository,
  ) {}

  async create(
    dto: CreatePartidaPresupuestalDto,
  ): Promise<PartidaPresupuestal> {
    const entity = new PartidaPresupuestal(
      0,
      dto.codigo,
      dto.nombre,
      dto.descripcion ?? null,
      true,
    );

    const savedEntity = await this.repoPartida.save(entity);
    this.logger.log(`Partida creada con ID: ${savedEntity.getId()}`);
    return savedEntity;
  }

  async findAll(): Promise<PartidaPresupuestal[]> {
    return await this.repoPartida.findAll();
  }

  async findOne(id: number): Promise<PartidaPresupuestal> {
    const partida = await this.repoPartida.findById(id);

    // Regla Senior: El servicio de aplicación valida la existencia para la capa API
    if (!partida) {
      throw new NotFoundException(`La partida con ID ${id} no existe`);
    }

    return partida;
  }

  async update(
    id: number,
    dto: UpdatePartidaDto,
  ): Promise<PartidaPresupuestal> {
    // 1. Buscamos la entidad rica (no un objeto plano)
    const partida = await this.findOne(id);

    // 2. Ejecutamos comportamientos de dominio, NO setters.
    // La entidad valida internamente si estos cambios son permitidos.
    if (dto.nombre) {
      partida.rename(dto.nombre, dto.descripcion);
    }

    if (dto.activo === false) {
      partida.desactivate();
    } else if (dto.activo === true) {
      partida.activate();
    }

    // 3. Persistimos los cambios
    const updatedPartida = await this.repoPartida.save(partida);
    this.logger.log(`Partida ${id} actualizada correctamente`);

    return updatedPartida;
  }

  async remove(id: number): Promise<void> {
    // Verificamos que exista antes de intentar borrar
    await this.findOne(id);

    await this.repoPartida.delete(id);
    this.logger.warn(`Partida ${id} eliminada`);
  }
}
