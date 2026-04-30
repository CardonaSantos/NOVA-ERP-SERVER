import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  CuentaContableRepository,
  CUENTA_CONTABLE_REPOSITORY,
} from '../domain/cuenta-contable.repository';
import { NaturalezaCuentaContable, TipoCuentaContable } from '../types/types';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { ErrorHandler } from 'src/utils/error_handler';

@Injectable()
export class CuentaContableService {
  private readonly logger = new Logger(CuentaContableService.name);

  constructor(
    @Inject(CUENTA_CONTABLE_REPOSITORY)
    private readonly repo: CuentaContableRepository,
  ) {}

  // CREAR
  async crear(
    data: {
      codigo: string;
      nombre: string;
      tipo: TipoCuentaContable;
      naturaleza: NaturalezaCuentaContable;
      permiteMovimiento?: boolean;
      padreId?: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaContable> {
    try {
      const existente = await this.repo.findByCodigo(data.codigo);
      if (existente) {
        throw new BadRequestException(
          `Ya existe una cuenta con código ${data.codigo}`,
        );
      }

      let padre: CuentaContable | null = null;

      if (data.padreId) {
        padre = await this.repo.findById(data.padreId);

        if (!padre) {
          throw new NotFoundException('Cuenta padre no encontrada');
        }

        if (!padre.estaActiva()) {
          throw new BadRequestException('La cuenta padre está inactiva');
        }
      }

      const entity = new CuentaContable(
        0,
        data.codigo,
        data.nombre,
        data.tipo,
        data.naturaleza,
        data.permiteMovimiento ?? true,
        true,
        data.padreId,
      );

      if (padre) {
        this.validarCompatibilidadPadre(entity, padre);
      }

      return await this.repo.save(entity, tx);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'crear cuenta contable',
        codigo: data.codigo,
      });
    }
  }

  // ACTUALIZAR
  async actualizar(
    id: number,
    data: {
      nombre?: string;
      tipo?: TipoCuentaContable;
      naturaleza?: NaturalezaCuentaContable;
      permiteMovimiento?: boolean;
      padreId?: number | null;
      activa?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaContable> {
    const entity = await this.obtenerPorId(id);

    try {
      if (data.nombre !== undefined && data.nombre !== entity.getNombre()) {
        entity.rename(data.nombre);
      }

      if (data.tipo !== undefined && data.tipo !== entity.getTipo()) {
        entity.cambiarTipo(data.tipo);
      }

      if (
        data.naturaleza !== undefined &&
        data.naturaleza !== entity.getNaturaleza()
      ) {
        entity.cambiarNaturaleza(data.naturaleza);
      }

      if (
        data.permiteMovimiento !== undefined &&
        data.permiteMovimiento !== entity.permiteMovimientos()
      ) {
        if (data.permiteMovimiento) entity.permitirMovimiento();
        else entity.bloquearMovimiento();
      }

      if (data.activa !== undefined && data.activa !== entity.estaActiva()) {
        if (data.activa) entity.activar();
        else entity.desactivar();
      }

      if (data.padreId !== undefined) {
        if (data.padreId === null) {
          entity.quitarPadre();
        } else {
          const padre = await this.repo.findById(data.padreId);
          if (!padre) {
            throw new NotFoundException('Cuenta padre no encontrada');
          }

          this.validarNoCiclo(entity.getId(), data.padreId);
          this.validarCompatibilidadPadre(entity, padre);

          if (data.padreId !== entity.getPadreId()) {
            entity.asignarPadre(data.padreId);
          }
        }
      }

      return await this.repo.update(entity, tx);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'actualizar cuenta contable',
        id,
      });
    }
  }

  // OBTENER
  async obtenerPorId(id: number): Promise<CuentaContable> {
    const entity = await this.repo.findById(id);

    if (!entity) {
      throw new NotFoundException(`Cuenta contable ${id} no encontrada`);
    }

    return entity;
  }

  async obtenerTodas(): Promise<CuentaContable[]> {
    return this.repo.findAll();
  }

  // ELIMINAR (SOFT)
  async eliminar(id: number, tx?: Prisma.TransactionClient) {
    const entity = await this.obtenerPorId(id);

    try {
      if (!entity.estaActiva()) {
        throw new BadRequestException('La cuenta ya está inactiva');
      }

      await this.repo.delete(id, tx);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'eliminar cuenta contable',
        id,
      });
    }
  }

  // VALIDACIONES PRO

  private async validarNoCiclo(actualId: number, nuevoPadreId: number) {
    if (actualId === nuevoPadreId) {
      throw new BadRequestException('Una cuenta no puede ser su propio padre');
    }

    let padre = await this.repo.findById(nuevoPadreId);

    while (padre) {
      if (padre.getId() === actualId) {
        throw new BadRequestException('Se detectó un ciclo en la jerarquía');
      }

      if (!padre.getPadreId()) break;

      padre = await this.repo.findById(padre.getPadreId()!);
    }
  }

  private validarCompatibilidadPadre(
    hijo: CuentaContable,
    padre: CuentaContable,
  ) {
    if (hijo.getTipo() !== padre.getTipo()) {
      throw new BadRequestException(
        'El tipo de cuenta debe coincidir con el padre',
      );
    }
  }
}
