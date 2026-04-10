import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MOVIMIENTO_REPOSITORY,
  MovimientoRepository,
} from '../domain/movimiento.repository';
import {
  MovimientoFiltros,
  PaginatedMovimientos,
  TipoMovimientoPresupuesto,
} from '../interfaces/interfaces';
import { ErrorHandler } from 'src/utils/error_handler'; // Ajusta la ruta a tu manejador global
import { MovimientoPresupuesto } from '../entities/movimiento.entity';
import { Prisma } from '@prisma/client';

/**
 * Interfaz limpia para recibir los parámetros desde otros servicios.
 * Al no usar clases DTO con validadores de NestJS (@IsString, etc.),
 * optimizamos el rendimiento, ya que esto no viene de peticiones HTTP crudas.
 */
export interface RegistrarMovimientoParams {
  presupuestoId: number;
  tipoMovimiento: TipoMovimientoPresupuesto;
  monto: number;
  descripcion?: string;
  requisicionId?: number;
  compraId?: number;
  usuarioId?: number;
}

@Injectable()
export class MovimientosService {
  private readonly logger = new Logger(MovimientosService.name);

  constructor(
    @Inject(MOVIMIENTO_REPOSITORY)
    private readonly repoMovimiento: MovimientoRepository,
  ) {}

  // MÉTODOS DE ESCRITURA  - USO INTERNO

  async registrar(
    params: RegistrarMovimientoParams,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoPresupuesto> {
    try {
      const entidad = new MovimientoPresupuesto(
        0,
        params.presupuestoId,
        params.tipoMovimiento,
        params.monto,
        new Date(),
        params.descripcion || null,
        params.requisicionId || null,
        params.compraId || null,
        params.usuarioId || null,
      );

      const guardado = await this.repoMovimiento.save(entidad, tx);

      this.logger.log(
        `Movimiento registrado: [${guardado.getTipoMovimiento()}] por $${guardado.getMonto()} (Presupuesto ID: ${guardado.getPresupuestoId()})`,
      );

      return guardado;
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  // MÉTODOS DE LECTURA

  async obtenerHistorialPorPresupuesto(
    presupuestoId: number,
  ): Promise<MovimientoPresupuesto[]> {
    try {
      return await this.repoMovimiento.findByPresupuestoId(presupuestoId);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  //  SEGURIDAD FINANCIERA

  async verificarCompromisoExistente(requisicionId: number): Promise<boolean> {
    try {
      const movimiento =
        await this.repoMovimiento.findCompromisoByRequisicion(requisicionId);
      return movimiento !== null; // Si existe devuelve true, si no, false
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async getTabla(filtros: MovimientoFiltros): Promise<PaginatedMovimientos> {
    return this.repoMovimiento.findForTable(filtros);
  }
}
