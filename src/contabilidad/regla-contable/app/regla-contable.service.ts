import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
  Prisma,
} from '@prisma/client';

import {
  ReglaContableRepository,
  REGLA_CONTABLE_REPOSITORY,
} from '../domain/regla-contable.repository';

import { ReglaContable } from '../entities/regla-contable.entity';
import { ErrorHandler } from 'src/utils/error_handler';
import { CreateReglaContableDto } from '../dto/create-regla-contable.dto';
import {
  ASIENTO_CONTABLE_REPOSITORY,
  AsientoContableRepository,
} from 'src/contabilidad/asiento-contable/domain/domain.repository';
import { AsientoContableLinea } from 'src/contabilidad/asiento-contable/entities/asiento-contable-linea.entity';
import { AsientoContable } from 'src/contabilidad/asiento-contable/entities/asiento-contable.entity';
import { ReglaContableMapper } from '../common/mappers';

@Injectable()
export class ReglaContableService {
  private readonly logger = new Logger(ReglaContableService.name);

  constructor(
    @Inject(REGLA_CONTABLE_REPOSITORY)
    private readonly repo: ReglaContableRepository,
  ) {}

  async obtenerTodas() {
    return this.repo.findAll();
  }

  // CREAR
  async crear(
    data: CreateReglaContableDto,

    tx?: Prisma.TransactionClient,
  ): Promise<ReglaContable> {
    try {
      const entity = new ReglaContable(
        0,
        data.codigo,
        data.nombre,
        data.origen,
        data.cuentaDebeId,
        data.cuentaHaberId,
        data.prioridad,
        true,
        data.descripcion,
        data.clasificacion,
        data.motivo,
        data.metodoPago,
        data.usaCentroCosto,
        data.usaPartidaPresupuestal,
      );

      return await this.repo.save(entity, tx);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'crear regla contable',
      });
    }
  }

  // ACTUALIZAR
  async actualizar(
    id: number,
    data: Partial<{
      codigo: string;
      nombre: string;
      descripcion: string;
      cuentaDebeId: number;
      cuentaHaberId: number;
      clasificacion?: ClasificacionAdmin;
      motivo?: MotivoMovimiento;
      metodoPago?: MetodoPago;
      prioridad: number;
      activa: boolean;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<ReglaContable> {
    this.logger.log(`actualizar() iniciado id=${id}`);
    this.logger.debug(`payload recibido=${JSON.stringify(data, null, 2)}`);

    const entity = await this.obtenerPorId(id);

    this.logger.debug(
      `antes de mutar=${JSON.stringify(ReglaContableMapper.toPersistence(entity), null, 2)}`,
    );

    try {
      if (data.codigo !== undefined) {
        this.logger.debug(`cambiando codigo: ${data.codigo}`);
        entity.cambiarCodigo(data.codigo);
      }

      if (data.nombre !== undefined) {
        this.logger.debug(`cambiando nombre: ${data.nombre}`);
        entity.cambiarNombre(data.nombre);
      }

      if (data.descripcion !== undefined) {
        this.logger.debug(`cambiando descripcion: ${data.descripcion}`);
        entity.cambiarDescripcion(data.descripcion);
      }

      if (data.cuentaDebeId !== undefined && data.cuentaHaberId !== undefined) {
        this.logger.debug(
          `cambiando cuentas debe/haber: ${data.cuentaDebeId}/${data.cuentaHaberId}`,
        );
        entity.cambiarCuentas(data.cuentaDebeId, data.cuentaHaberId);
      }

      if (
        data.clasificacion !== undefined ||
        data.motivo !== undefined ||
        data.metodoPago !== undefined
      ) {
        this.logger.debug(
          `cambiando contexto: ${JSON.stringify(
            {
              clasificacion: data.clasificacion,
              motivo: data.motivo,
              metodoPago: data.metodoPago,
            },
            null,
            2,
          )}`,
        );

        entity.cambiarContexto({
          clasificacion: data.clasificacion,
          motivo: data.motivo,
          metodoPago: data.metodoPago,
        });
      }

      if (data.prioridad !== undefined) {
        this.logger.debug(`cambiando prioridad: ${data.prioridad}`);
        entity.cambiarPrioridad(data.prioridad);
      }

      if (data.activa === true) entity.activar();
      if (data.activa === false) entity.desactivar();

      this.logger.debug(
        `despues de mutar=${JSON.stringify(ReglaContableMapper.toPersistence(entity), null, 2)}`,
      );

      const result = await this.repo.update(entity, tx);

      this.logger.log(`actualizar() OK id=${id}`);
      this.logger.debug(
        `retorno repo=${JSON.stringify(ReglaContableMapper.toPersistence(result), null, 2)}`,
      );

      return result;
    } catch (error) {
      this.logger.error(`actualizar() falló id=${id}`, error);
      ErrorHandler.handle(error, {
        operacion: 'actualizar regla contable',
        id,
      });
    }
  }

  // OBTENER
  async obtenerPorId(id: number): Promise<ReglaContable> {
    const entity = await this.repo.findById(id);

    if (!entity) {
      throw new NotFoundException(`Regla ${id} no encontrada`);
    }

    return entity;
  }

  //  MOTOR DE REGLAS
  async resolverRegla(
    contexto: {
      origen: OrigenAsientoContable;
      clasificacion?: ClasificacionAdmin;
      motivo?: MotivoMovimiento;
      metodoPago?: MetodoPago;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ReglaContable> {
    try {
      const candidatas = await this.repo.findByContext(contexto, tx);

      if (!candidatas.length) {
        throw new BadRequestException(
          'No hay reglas contables para este contexto',
        );
      }

      const aplicables = candidatas.filter((r) => r.aplica(contexto));

      if (!aplicables.length) {
        throw new BadRequestException('No hay reglas aplicables');
      }

      aplicables.sort((a, b) => b.getPrioridad() - a.getPrioridad());

      if (
        aplicables.length > 1 &&
        aplicables[0].getPrioridad() === aplicables[1].getPrioridad()
      ) {
        throw new BadRequestException(
          'Conflicto de reglas contables: misma prioridad',
        );
      }

      return aplicables[0];
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'resolver regla contable',
        contexto,
      });
    }
  }

  // ELIMINAR
  async eliminar(id: number, tx?: Prisma.TransactionClient) {
    await this.obtenerPorId(id);

    return this.repo.delete(id, tx);
  }
}
