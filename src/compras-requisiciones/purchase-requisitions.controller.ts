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
  Logger,
} from '@nestjs/common';
import { PurchaseRequisitionsService } from './purchase-requisitions.service';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto';
import { ComprasRegistrosQueryDto } from './dto/compras-registros.query.dto';
import { RecepcionarCompraAutoDto } from './dto/compra-recepcion.dto';
// import { CreateCompraRecepcionDto } from './dto/compra-recepcion.dto';

@Controller('compra-requisicion')
export class PurchaseRequisitionsController {
  private readonly logger = new Logger(PurchaseRequisitionsController.name);
  constructor(
    private readonly purchaseRequisitionsService: PurchaseRequisitionsService,
  ) {}

  /**
   * Generar la compra a partir de una Requisicion
   * @param createPurchaseRequisitionDto DTO
   * @returns
   */
  @Post('generar-compra')
  generateCompraFromRequisicion(
    @Body() createPurchaseRequisitionDto: CreatePurchaseRequisitionDto,
  ) {
    this.logger.log(
      `DTO recibido:\n${JSON.stringify(createPurchaseRequisitionDto, null, 2)}`,
    );
    return this.purchaseRequisitionsService.createCompraFromRequisiciones(
      createPurchaseRequisitionDto,
    );
  }

  /**
   * RECEPCIONAR UNA COMPRA AUTO SIN PARCIALES
   * @param id ID de la compra
   * @param body  cuerpo de params de la compra
   * @returns
   */
  @Post(':id/recepcionar')
  recepcionarById(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: Omit<RecepcionarCompraAutoDto, 'compraId'> & { compraId?: number },
  ) {
    return this.purchaseRequisitionsService.makeRecepcionCompraAuto({
      ...body,
      compraId: id,
    });
  }

  @Get('get-registros-compras-con-detalle')
  findAll(@Query() q: ComprasRegistrosQueryDto) {
    return this.purchaseRequisitionsService.getRegistrosCompras(q);
  }

  /**
   * Servicio que retorna el registro de compra para su recepcion
   * @param id ID del registro de compra
   * @returns El registro de compra para su recepción
   */
  @Get('get-registro/:id')
  getRegistroCompra(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequisitionsService.getRegistroCompra(id);
  }

  @Get('get-all-compras')
  getComprasDetallesFull() {
    return this.purchaseRequisitionsService.getComprasDetallesFull();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePurchaseRequisitionDto: UpdatePurchaseRequisitionDto,
  ) {
    return this.purchaseRequisitionsService.update(
      +id,
      updatePurchaseRequisitionDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.purchaseRequisitionsService.remove(+id);
  }
}
