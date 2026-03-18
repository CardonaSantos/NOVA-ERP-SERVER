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
import { ComprometerSaldoDto, EjercerSaldoDto } from '../dto/operaciones-dto';
import { LiberarSaldoDto } from '../dto/liberate-compromiso';

@Controller('presupuestos')
export class PresupuestosController {
  constructor(private readonly presupuestosService: PresupuestosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreatePresupuestoDto) {
    return await this.presupuestosService.crear(dto);
  }

  @Post(':id/liberar')
  @HttpCode(HttpStatus.OK)
  async liberarSaldo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LiberarSaldoDto,
  ) {
    return await this.presupuestosService.liberarSaldo(id, dto);
  }

  @Get()
  async obtenerTodos() {
    return await this.presupuestosService.obtenerTodos();
  }

  @Get('/details/:id')
  async obtenerDetalles(@Param('id', ParseIntPipe) id: number) {
    return await this.presupuestosService.obtenerDetalleCompleto(id);
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
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return await this.presupuestosService.eliminar(id);
  }

  // =========================================================================
  // ENDPOINTS DE ACCIONES FINANCIERAS (REST Sub-recursos)
  // =========================================================================

  /**
   * Endpoint para apartar dinero (Ej. llamado por el módulo de Requisiciones o Manualmente)
   * POST /presupuestos/5/comprometer
   */
  @Post(':id/comprometer')
  @HttpCode(HttpStatus.OK)
  async comprometerSaldo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComprometerSaldoDto, // Usamos el nuevo DTO
  ) {
    return await this.presupuestosService.comprometerSaldo(
      id,
      dto.monto,
      dto.requisicionId,
      dto.usuarioId,
    );
  }

  /**
   * Endpoint para ejercer dinero
   * POST /presupuestos/5/ejercer
   */
  @Post(':id/ejercer')
  @HttpCode(HttpStatus.OK)
  async ejercerSaldo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EjercerSaldoDto, // Usamos el nuevo DTO
  ) {
    return await this.presupuestosService.ejercerSaldo(
      id,
      dto.monto,
      dto.compraId,
      dto.usuarioId,
    );
  }
}
