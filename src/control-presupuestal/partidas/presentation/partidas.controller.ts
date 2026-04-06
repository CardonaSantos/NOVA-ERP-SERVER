import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { PartidasService } from '../app/partidas.service';
import { UpdatePartidaDto } from '../dto/update-partida.dto';
import { CreatePartidaPresupuestalDto } from '../dto/create-partida.dto';

@Controller('partidas') // Ruta base: /partidas
export class PartidasController {
  private readonly logger = new Logger(PartidasController.name);
  constructor(private readonly partidasService: PartidasService) {}

  @Post()
  async crear(@Body() createPartidaDto: CreatePartidaPresupuestalDto) {
    this.logger.log(
      `DTO recibido:\n${JSON.stringify(createPartidaDto, null, 2)}`,
    );
    return await this.partidasService.create(createPartidaDto);
  }

  @Get()
  async obtenerTodas() {
    return await this.partidasService.findAll();
  }

  @Get('select')
  async obtenerTodasSelect() {
    return await this.partidasService.findAllSelect();
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
