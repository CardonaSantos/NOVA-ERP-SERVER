import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Query,
} from '@nestjs/common';
import { MovimientosService } from '../app/movimientos.service';
import { QueryMovimientosDto } from '../dto/query';
import { PaginatedMovimientos } from '../interfaces/interfaces';

@Controller('movimientos')
export class MovimientosController {
  constructor(private readonly movimientosService: MovimientosService) {}

  /**
   * Obtiene el historial contable (Ledger) de un presupuesto específico.
   * Ruta: GET /movimientos/presupuesto/5
   * * @param presupuestoId ID del presupuesto a auditar
   */
  @Get('presupuesto/:presupuestoId')
  @HttpCode(HttpStatus.OK)
  async obtenerHistorialPorPresupuesto(
    @Param('presupuestoId', ParseIntPipe) presupuestoId: number,
  ) {
    return await this.movimientosService.obtenerHistorialPorPresupuesto(
      presupuestoId,
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryMovimientosDto,
  ): Promise<PaginatedMovimientos> {
    return this.movimientosService.getTabla({
      periodoId: query.periodoId,
      centroCostoId: query.centroCostoId,
      tipo: query.tipo,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
