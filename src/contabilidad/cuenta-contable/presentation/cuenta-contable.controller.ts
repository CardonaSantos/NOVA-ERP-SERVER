import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Logger,
} from '@nestjs/common';

import { CuentaContableService } from '../app/cuenta-contable.service';
import { CreateCuentaContableDto } from '../dto/create-cuenta-contable.dto';
import { UpdateCuentaContableDto } from '../dto/update-cuenta-contable.dto';

@Controller('cuentas-contables')
// @UsePipes(
//   new ValidationPipe({
//     whitelist: true,
//     forbidNonWhitelisted: true,
//     transform: true,
//   }),
// )
export class CuentaContableController {
  private readonly logger = new Logger(CuentaContableController.name);

  constructor(private readonly cuentaService: CuentaContableService) {}

  // CREAR
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateCuentaContableDto) {
    this.logger.log(`DTO recibido:\n${JSON.stringify(dto, null, 2)}`);
    return this.cuentaService.crear(dto);
  }

  // LISTAR
  @Get()
  async obtenerTodas() {
    return this.cuentaService.obtenerTodas();
  }

  // DETALLE
  @Get(':id')
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.cuentaService.obtenerPorId(id);
  }

  // ACTUALIZAR
  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCuentaContableDto,
  ) {
    this.logger.log(`DTO recibido:\n${JSON.stringify(dto, null, 2)}`);

    return this.cuentaService.actualizar(id, dto);
  }

  // ELIMINAR (SOFT)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.cuentaService.eliminar(id);
  }
}
