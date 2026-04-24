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
import { ReglaContableService } from '../app/regla-contable.service';
import { CreateReglaContableDto } from '../dto/create-regla-contable.dto';
import { UpdateReglaContableDto } from '../dto/update-regla-contable.dto';
import { ResolverReglaContableDto } from '../dto/resolve-dto';

@Controller('reglas-contables')
// @UsePipes(
//   new ValidationPipe({
//     whitelist: true,
//     forbidNonWhitelisted: true,
//     transform: true,
//   }),
// )
export class ReglaContableController {
  private readonly logger = new Logger(ReglaContableController.name);
  constructor(private readonly service: ReglaContableService) {}

  // =========================
  // CREAR
  // =========================
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateReglaContableDto) {
    return this.service.crear(dto);
  }

  // =========================
  // LISTAR
  // =========================
  @Get()
  async obtenerTodas() {
    return this.service.obtenerTodas();
  }

  // =========================
  // DETALLE
  // =========================
  @Get(':id')
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerPorId(id);
  }

  // =========================
  // ACTUALIZAR
  // =========================
  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReglaContableDto,
  ) {
    this.logger.log(`DTO recibido:\n${JSON.stringify(dto, null, 2)}`);
    return this.service.actualizar(id, dto);
  }

  // =========================
  // ELIMINAR (soft o lógico según tu impl)
  // =========================
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.service.eliminar(id);
  }

  // 🔥 DEBUG / TEST DE REGLA
  @Post('resolver')
  async resolver(@Body() dto: ResolverReglaContableDto) {
    return this.service.resolverRegla(dto);
  }
}
