import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { PlantillaLegalCreditoService } from '../app/plantilla-legal-credito.service';
import { CreatePlantillaLegalCreditoDto } from '../dto/create-plantilla-legal-credito.dto';
import { UpdatePlantillaLegalCreditoDto } from '../dto/update-plantilla-legal-credito.dto';

@Controller('plantilla-legal-credito')
export class PlantillaLegalCreditoController {
  private readonly logger = new Logger(PlantillaLegalCreditoController.name);
  constructor(private readonly service: PlantillaLegalCreditoService) {}

  @Post()
  create(@Body() dto: CreatePlantillaLegalCreditoDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('render/:ventaCuotaId/:plantillaId')
  getContratoHTML(
    @Param('ventaCuotaId', ParseIntPipe) ventaCuotaId: number,
    @Param('plantillaId', ParseIntPipe) plantillaId: number,
  ) {
    return this.service.getContratoHTML(ventaCuotaId, plantillaId);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantillaLegalCreditoDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post('delete')
  delete(@Body('id') id: number) {
    return this.service.delete(Number(id));
  }
}
