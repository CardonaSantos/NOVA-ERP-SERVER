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
import { MovimientoCajaService } from './movimiento-caja.service';
import { CreateMovimientoCajaDto } from './dto/create-movimiento-caja.dto';
import { UpdateMovimientoCajaDto } from './dto/update-movimiento-caja.dto';

@Controller('movimiento-caja')
export class MovimientoCajaController {
  constructor(private readonly movimientoCajaService: MovimientoCajaService) {}

  @Post()
  create(@Body() dto: CreateMovimientoCajaDto) {
    console.log('La data del dto es: ', dto);

    // return this.movimientoCajaService.registrarMovimientoCaja(dto);
  }

  @Get('movimientos-caja/:id')
  findAll(@Param('id', ParseIntPipe) id: number) {
    return this.movimientoCajaService.getMovimientosPorCaja(id);
  }

  @Get('get-all')
  findOne() {
    return this.movimientoCajaService.getAllMovimientos();
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMovimientoCajaDto: UpdateMovimientoCajaDto,
  ) {}

  @Delete('delete-movimiento/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.movimientoCajaService.deleteMovimientoById(id);
  }
}
