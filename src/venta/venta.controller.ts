import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { VentaService } from './venta.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { QueryVentasTable } from './query/queryTableVentas';

@Controller('venta')
export class VentaController {
  constructor(private readonly ventaService: VentaService) {}

  // PARA LA CREACION DE VENTAS NORMALES
  @Post()
  async create(@Body() createVentaDto: CreateVentaDto) {
    return await this.ventaService.createVentaTx(createVentaDto);
  }

  @Get()
  async findAll() {
    return await this.ventaService.findAll();
  }

  @Get('/find-customer-sales/:customerId')
  async findAllSaleCustomer(
    @Param('customerId', ParseIntPipe) customerId: number,
  ) {
    return await this.ventaService.findAllSaleCustomer(customerId);
  }

  @Get('/garantia-venta/:ventaId')
  async getProductsToGarantia(@Param('ventaId', ParseIntPipe) ventaId: number) {
    return await this.ventaService.getVentaGarantia(ventaId);
  }

  @Get('/find-my-sucursal-sales/:id')
  async findAllSaleSucursal(
    @Param('id', ParseIntPipe) id: number,
    @Query(
      new ValidationPipe({
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    )
    query: QueryVentasTable,
  ) {
    // overrule: sucursal viene del path param
    const q: QueryVentasTable = {
      ...query,
      sucursalId: id,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'fechaVenta',
      sortDir: (query.sortDir ?? 'desc') as 'asc' | 'desc',
    };
    return this.ventaService.findAllSaleSucursal(q);
  }

  @Get('/get-ventas-caja/:id/:usuarioId')
  async getSalesToCashRegist(
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    return await this.ventaService.getSalesToCashRegist(id, usuarioId);
  }

  @Get('/get-sale/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.ventaService.findOneSale(id);
  }

  @Get('/venta-to-garantia')
  async getVentasToGarantia() {
    return await this.ventaService.getVentasToGarantia();
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVentaDto: UpdateVentaDto,
  ) {
    return await this.ventaService.update(id, updateVentaDto);
  }

  @Delete('/delete-all')
  async removeAll() {
    return await this.ventaService.removeAll();
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.ventaService.remove(id);
  }
}
