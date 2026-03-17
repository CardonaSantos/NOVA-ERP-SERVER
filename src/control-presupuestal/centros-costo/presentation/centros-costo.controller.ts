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
import { CentrosCostoService } from '../app/centros-costo.service';
import { CreateCentroCostoDto } from '../dto/create-centros-costo.dto';
import { UpdateCentroCostoDto } from '../dto/update-centros-costo.dto';

@Controller('centros-costo')
export class CentrosCostoController {
  constructor(private readonly centrosCostoService: CentrosCostoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateCentroCostoDto) {
    return await this.centrosCostoService.crear(dto);
  }

  @Get()
  async obtenerTodos() {
    return await this.centrosCostoService.obtenerTodos();
  }

  @Get(':id')
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return await this.centrosCostoService.obtenerPorId(id);
  }

  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCentroCostoDto,
  ) {
    return await this.centrosCostoService.actualizar(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return await this.centrosCostoService.eliminar(id);
  }
}
