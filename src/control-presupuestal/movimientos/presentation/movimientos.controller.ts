import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { MovimientosService } from '../app/movimientos.service';

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
}
