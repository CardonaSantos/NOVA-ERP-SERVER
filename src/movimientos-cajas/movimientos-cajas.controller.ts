import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { MovimientosCajasService } from './movimientos-cajas.service';
import { CreateMovimientosCajaDto } from './dto/create-movimientos-caja.dto';
import { UpdateMovimientosCajaDto } from './dto/update-movimientos-caja.dto';
import { PageOptionsDto } from 'src/utils/page-options';
import { MovimientosQueryDto } from './dto/movimientos-query.dto';

@Controller('movimientos-cajas')
export class MovimientosCajasController {
  constructor(
    private readonly movimientosCajasService: MovimientosCajasService,
  ) {}

  /**
   * PARA EL TABLE DE LA VISTA HISTORIALES, SUPER IMPORTANTE
   * NOTA: LAS CATEGORIAS INFERIDAS ESTÁN MAL, CAMBIAR EL TIPO POR EL DATO REAL
   * @param query QUERY SERCH
   * @returns
   */
  @Get()
  findAll(@Query() query: MovimientosQueryDto) {
    return this.movimientosCajasService.getMovimientosCaja(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.movimientosCajasService.getMovimientoCajaById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMovimientosCajaDto: UpdateMovimientosCajaDto,
  ) {
    // return this.movimientosCajasService.update(+id, updateMovimientosCajaDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.movimientosCajasService.remove(+id);
  }
}
