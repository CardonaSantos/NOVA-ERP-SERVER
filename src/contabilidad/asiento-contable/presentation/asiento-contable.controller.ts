import { AsientoContableService } from '../app/asiento-contable.service';
import {
  Controller,
  Post,
  Param,
  ParseIntPipe,
  Body,
  Get,
} from '@nestjs/common';
import { CreateAsientoContableDto } from '../dto/dto';
@Controller('asientos-contables')
export class AsientoContableController {
  constructor(private readonly service: AsientoContableService) {}

  @Post()
  async crear(@Body() dto: CreateAsientoContableDto) {
    return this.service.crearAsiento(dto);
  }

  @Get()
  async get() {
    return this.service.getAll();
  }

  @Post(':id/reversar')
  async reversar(@Param('id', ParseIntPipe) id: number) {
    return this.service.reversarAsiento(id);
  }
}
