import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  PRESUPUESTO_REPOSITORY,
  PresupuestoRepository,
} from '../domain/presupuesto.repository';
import { CreatePresupuestoDto } from '../dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from '../dto/update-presupuesto.dto';
import { Presupuesto } from '../entities/presupuesto.entity';
import { ErrorHandler } from 'src/utils/error_handler';

@Injectable()
export class PresupuestosService {
  private readonly logger = new Logger(PresupuestosService.name);

  constructor(
    @Inject(PRESUPUESTO_REPOSITORY)
    private readonly repoPresupuesto: PresupuestoRepository,
  ) {}

  async crear(dto: CreatePresupuestoDto): Promise<Presupuesto> {
    try {
      const existente = await this.repoPresupuesto.findByLlaveCompuesta(
        dto.periodoId,
        dto.centroCostoId,
        dto.partidaId,
      );

      if (existente) {
        throw new BadRequestException(
          `Ya existe un presupuesto asignado para este Centro de Costo y Partida en el Periodo seleccionado.`,
        );
      }

      const entity = new Presupuesto(
        0,
        dto.centroCostoId,
        dto.periodoId,
        dto.partidaId,
        dto.montoAsignado,
      );

      return await this.repoPresupuesto.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async obtenerTodos(): Promise<Presupuesto[]> {
    try {
      return await this.repoPresupuesto.findAll();
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async obtenerPorId(id: number): Promise<Presupuesto> {
    try {
      const record = await this.repoPresupuesto.findById(id);
      if (!record) {
        throw new NotFoundException(`El Presupuesto con ID ${id} no existe`);
      }
      return record;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async actualizarAsignacion(
    id: number,
    dto: UpdatePresupuestoDto,
  ): Promise<Presupuesto> {
    try {
      const entity = await this.obtenerPorId(id);

      // Calcular la diferencia para saber si es ampliación o recorte
      if (dto.montoAsignado !== undefined) {
        const diferencia = dto.montoAsignado - entity.getMontoAsignado();

        if (diferencia > 0) {
          entity.ampliarPresupuesto(diferencia);
        } else if (diferencia < 0) {
          // Pasamos el valor absoluto porque el método espera una cantidad positiva
          entity.decrementarPresupuesto(Math.abs(diferencia));
        }
      }

      return await this.repoPresupuesto.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  // =========================================================================
  // MÉTODOS DE OPERACIÓN FINANCIERA
  // =========================================================================

  async comprometerSaldo(
    id: number,
    montoAComprometer: number,
  ): Promise<Presupuesto> {
    try {
      const entity = await this.obtenerPorId(id);

      entity.comprometer(montoAComprometer);

      return await this.repoPresupuesto.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async ejercerSaldo(id: number, montoAEjercer: number): Promise<Presupuesto> {
    try {
      const entity = await this.obtenerPorId(id);
      entity.ejercer(montoAEjercer);

      return await this.repoPresupuesto.save(entity);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async eliminar(id: number): Promise<void> {
    try {
      const entity = await this.obtenerPorId(id);
      if (entity.getMontoComprometido() > 0 || entity.getMontoEjercido() > 0) {
        throw new BadRequestException(
          'No se puede eliminar un presupuesto que ya tiene movimientos financieros.',
        );
      }

      await this.repoPresupuesto.delete(id);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }
}
