import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PresupuestosService } from '../app/presupuestos.service';
import { CreatePresupuestoDto } from '../dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from '../dto/update-presupuesto.dto';

@Controller('presupuestos')
export class PresupuestosController {
  constructor(private readonly presupuestosService: PresupuestosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreatePresupuestoDto) {
    return await this.presupuestosService.crear(dto);
  }

  @Get()
  async obtenerTodos() {
    return await this.presupuestosService.obtenerTodos();
  }

  @Get(':id')
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return await this.presupuestosService.obtenerPorId(id);
  }

  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePresupuestoDto,
  ) {
    return await this.presupuestosService.actualizarAsignacion(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 204 No Content
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return await this.presupuestosService.eliminar(id);
  }

  // =========================================================================
  // ENDPOINTS DE ACCIONES FINANCIERAS (REST Sub-recursos)
  // =========================================================================

  /**
   * Endpoint para apartar dinero manualmente (Ej. desde una UI de ajuste)
   * Ruta: POST /presupuestos/5/comprometer
   */
  @Post(':id/comprometer')
  @HttpCode(HttpStatus.OK)
  async comprometerSaldo(
    @Param('id', ParseIntPipe) id: number,
    @Body('monto') monto: number, // Espera un JSON { "monto": 500 }
  ) {
    return await this.presupuestosService.comprometerSaldo(id, monto);
  }

  /**
   * Endpoint para ejercer dinero manualmente
   * Ruta: POST /presupuestos/5/ejercer
   */
  @Post(':id/ejercer')
  @HttpCode(HttpStatus.OK)
  async ejercerSaldo(
    @Param('id', ParseIntPipe) id: number,
    @Body('monto') monto: number,
  ) {
    return await this.presupuestosService.ejercerSaldo(id, monto);
  }
}
