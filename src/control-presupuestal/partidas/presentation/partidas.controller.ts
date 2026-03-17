import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { PartidasService } from '../app/partidas.service';
import { UpdatePartidaDto } from '../dto/update-partida.dto';
import { CreatePartidaPresupuestalDto } from '../dto/create-partida.dto';

@Controller('partidas') // Ruta base: /partidas
export class PartidasController {
  constructor(private readonly partidasService: PartidasService) {}

  @Post()
  async crear(@Body() createPartidaDto: CreatePartidaPresupuestalDto) {
    return await this.partidasService.create(createPartidaDto);
  }

  @Get()
  async obtenerTodas() {
    return await this.partidasService.findAll();
  }

  @Get(':id')
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return await this.partidasService.findOne(id);
  }

  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartidaDto: UpdatePartidaDto,
  ) {
    return await this.partidasService.update(id, updatePartidaDto);
  }

  @Delete(':id')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return await this.partidasService.remove(id);
  }
}
