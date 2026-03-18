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
import { PresupuestoDetalleView } from '../interfaces/interfaces-view';
import { MovimientosService } from 'src/control-presupuestal/movimientos/app/movimientos.service';
import { TipoMovimientoPresupuesto } from 'src/control-presupuestal/movimientos/interfaces/interfaces';
import { LiberarSaldoDto } from '../dto/liberate-compromiso';

@Injectable()
export class PresupuestosService {
  private readonly logger = new Logger(PresupuestosService.name);

  constructor(
    @Inject(PRESUPUESTO_REPOSITORY)
    private readonly repoPresupuesto: PresupuestoRepository,

    private readonly movimientosService: MovimientosService,
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

      const savedEntity = await this.repoPresupuesto.save(entity);

      // REGISTRAR MOVIMIENTO
      await this.movimientosService.registrar({
        monto: dto.montoAsignado,
        presupuestoId: savedEntity.getId(),
        tipoMovimiento: TipoMovimientoPresupuesto.ASIGNACION_INICIAL,
        descripcion: 'Asignacion inicial del presupuesto',
      });

      return savedEntity;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async obtenerDetalleCompleto(id: number): Promise<PresupuestoDetalleView> {
    try {
      const detalle = await this.repoPresupuesto.findDetalleById(id);
      if (!detalle) throw new NotFoundException('Presupuesto no encontrado');
      return detalle;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async obtenerTodos(): Promise<PresupuestoDetalleView[]> {
    try {
      return await this.repoPresupuesto.findAllDetalles();
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
          //  valor absoluto porque el método espera una cantidad positiva
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
    requisicionId: number,
    usuarioId: number,
  ): Promise<Presupuesto> {
    try {
      const yaCobrado =
        await this.movimientosService.verificarCompromisoExistente(
          requisicionId,
        );

      if (yaCobrado) {
        this.logger.warn(
          `La requisición ${requisicionId} ya había comprometido saldo. Ignorando.`,
        );
        return await this.obtenerPorId(id); // Devolvemos sin hacer nada
      }

      const entity = await this.obtenerPorId(id);

      entity.comprometer(montoAComprometer);

      const savedEntity = await this.repoPresupuesto.save(entity);

      await this.movimientosService.registrar({
        presupuestoId: id,
        tipoMovimiento: TipoMovimientoPresupuesto.COMPROMISO,
        monto: montoAComprometer,
        requisicionId: requisicionId,
        usuarioId: usuarioId,
        descripcion: `Compromiso por Requisición #${requisicionId}`,
      });

      return savedEntity;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async ejercerSaldo(
    id: number,
    montoAEjercer: number,
    compraId: number,
    usuarioId: number,
  ): Promise<Presupuesto> {
    try {
      const entity = await this.obtenerPorId(id);
      entity.ejercer(montoAEjercer);

      const savedEntity = await this.repoPresupuesto.save(entity);

      await this.movimientosService.registrar({
        monto: montoAEjercer,
        presupuestoId: id,
        tipoMovimiento: TipoMovimientoPresupuesto.EJERCICIO,
        compraId: compraId,
        usuarioId: usuarioId,
        descripcion: `Gasto ejercido por Compra #${compraId}`,
      });

      return savedEntity;
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

  async liberarSaldo(id: number, dto: LiberarSaldoDto): Promise<Presupuesto> {
    try {
      const entity = await this.obtenerPorId(id);

      // rollback en la entidad
      entity.liberarCompromiso(dto.monto);

      //  saldos actualizados
      const savedEntity = await this.repoPresupuesto.save(entity);

      // anulación en el historial
      await this.movimientosService.registrar({
        presupuestoId: id,
        tipoMovimiento: TipoMovimientoPresupuesto.LIBERACION_COMPROMISO,
        monto: dto.monto,
        requisicionId: dto.requisicionId,
        usuarioId: dto.usuarioId,
        descripcion:
          dto.descripcion ||
          `Liberación de saldo por cancelación de REQ #${dto.requisicionId}`,
      });

      return savedEntity;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }
}
