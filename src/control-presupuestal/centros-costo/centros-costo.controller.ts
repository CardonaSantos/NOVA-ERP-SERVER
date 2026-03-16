import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CentrosCostoService } from './centros-costo.service';
import { CreateCentrosCostoDto } from './dto/create-centros-costo.dto';
import { UpdateCentrosCostoDto } from './dto/update-centros-costo.dto';

@Controller('centros-costo')
export class CentrosCostoController {
  constructor(private readonly centrosCostoService: CentrosCostoService) {}

  @Post()
  create(@Body() createCentrosCostoDto: CreateCentrosCostoDto) {
    return this.centrosCostoService.create(createCentrosCostoDto);
  }

  @Get()
  findAll() {
    return this.centrosCostoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.centrosCostoService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCentrosCostoDto: UpdateCentrosCostoDto) {
    return this.centrosCostoService.update(+id, updateCentrosCostoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.centrosCostoService.remove(+id);
  }
}
