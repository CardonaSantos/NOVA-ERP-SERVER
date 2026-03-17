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
import { PeriodosService } from '../app/periodos.service';
import { CreatePeriodoDto } from '../dto/create-periodo.dto';
import { UpdatePeriodoDto } from '../dto/update-periodo.dto';

@Controller('periodos')
export class PeriodosController {
  constructor(private readonly periodosService: PeriodosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreatePeriodoDto) {
    return await this.periodosService.save(dto);
  }

  @Get()
  async obtenerTodos() {
    return await this.periodosService.findAll();
  }

  @Get(':id')
  async obtenerUno(@Param('id', ParseIntPipe) id: number) {
    return await this.periodosService.findOne(id);
  }

  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePeriodoDto,
  ) {
    return await this.periodosService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return await this.periodosService.delete(id);
  }
}
