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
    const entity = await this.obtenerPorId(id);

    try {
      if (data.nombre) entity.cambiarNombre(data.nombre);
      if (data.descripcion !== undefined)
        entity.cambiarDescripcion(data.descripcion);

      if (data.cuentaDebeId && data.cuentaHaberId) {
        entity.cambiarCuentas(data.cuentaDebeId, data.cuentaHaberId);
      }

      if (
        data.clasificacion !== undefined ||
        data.motivo !== undefined ||
        data.metodoPago !== undefined
      ) {
        entity.cambiarContexto({
          clasificacion: data.clasificacion,
          motivo: data.motivo,
          metodoPago: data.metodoPago,
        });
      }

      if (data.prioridad) {
        entity.cambiarPrioridad(data.prioridad);
      }

      if (data.activa === true) entity.activar();
      if (data.activa === false) entity.desactivar();

      return await this.repo.update(entity, tx);
    } catch (error) {
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
  async resolverRegla(contexto: {
    origen: OrigenAsientoContable;
    clasificacion?: ClasificacionAdmin;
    motivo?: MotivoMovimiento;
    metodoPago?: MetodoPago;
  }): Promise<ReglaContable> {
    try {
      const candidatas = await this.repo.findByContext(contexto);

      if (!candidatas.length) {
        throw new BadRequestException(
          'No hay reglas contables para este contexto',
        );
      }

      // 🔥 Filtrar con lógica de dominio
      const aplicables = candidatas.filter((r) => r.aplica(contexto));

      if (!aplicables.length) {
        throw new BadRequestException('No hay reglas aplicables');
      }

      // 🔥 Ordenar por prioridad
      aplicables.sort((a, b) => b.getPrioridad() - a.getPrioridad());

      // 🔥 detectar ambigüedad
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
