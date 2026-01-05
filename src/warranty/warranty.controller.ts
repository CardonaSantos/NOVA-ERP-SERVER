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
import { WarrantyService } from './warranty.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { UpdateWarrantyDto } from './dto/update-warranty.dto';
import { RegistroGarantiaDto } from './dto/create-regist-warranty.dto';
import { createNewTimeLimeDTO } from './dto-timeline/timelineCreateDTO.dto';

@Controller('warranty')
export class WarrantyController {
  constructor(private readonly warrantyService: WarrantyService) {}
  //CREAR UN REGISTRO DE GARANTÍA
  @Post()
  create(@Body() createWarrantyDto: CreateWarrantyDto) {
    return this.warrantyService.create(createWarrantyDto);
  }

  @Post('create-new-timeline')
  createNewTimeLime(@Body() createWarrantyDto: createNewTimeLimeDTO) {
    return this.warrantyService.createNewTimeLime(createWarrantyDto);
  }

  @Get('/get-regists-warranties')
  findAllRegistWarranties() {
    return this.warrantyService.getGarantiasNotClosed();
  }

  @Get('/get-regists-warranties-historial')
  findAllGarantias() {
    return this.warrantyService.getAllGarantias();
  }

  @Get('/get-one-regist-final-pdf/:id')
  findOneRegistPDF(@Param('id', ParseIntPipe) id: number) {
    return this.warrantyService.getOneWarrantyFinalForPdf(id);
  }

  @Get()
  findAll() {
    return this.warrantyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.warrantyService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWarrantyDto: UpdateWarrantyDto,
  ) {
    return this.warrantyService.update(id, updateWarrantyDto);
  }

  @Delete('/delete-all')
  removeAll() {
    return this.warrantyService.removeAll();
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.warrantyService.remove(id);
  }
}
