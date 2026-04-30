import { AsientoContableService } from '../app/asiento-contable.service';
import {
  Controller,
  Post,
  Param,
  ParseIntPipe,
  Body,
  Get,
  Query,
  Logger,
} from '@nestjs/common';
import { CreateAsientoContableDto } from '../dto/dto';
import { EstadoAsientoContable, OrigenAsientoContable } from '@prisma/client';
@Controller('asientos-contables')
export class AsientoContableController {
  constructor(private readonly service: AsientoContableService) {}
  @Post()
  async crear(@Body() dto: CreateAsientoContableDto) {
    return this.service.crearAsiento(dto);
  }

  @Get()
  async get(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
    @Query('estado') estado?: EstadoAsientoContable,
    @Query('origen') origen?: OrigenAsientoContable,
    @Query('sortBy') sortBy: string = 'fecha',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.service.getAll({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      estado,
      origen,
      sortBy,
      sortOrder,
    });
  }

  @Post(':id/reversar')
  async reversar(@Param('id', ParseIntPipe) id: number) {
    return this.service.reversarAsiento(id);
  }
}
