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
import { MetasService } from './metas.service';
import { CreateMetaDto } from './dto/create-meta.dto';
import { UpdateMetaDto } from './dto/update-meta.dto';
import { CreateMetaUsuarioDto } from './dto/MetaUsuarioDTO.dto';
import { CreateMetaCobrosDto } from './dto/MetaCobrosDTO.dto';
import { CreateDepositoCobroDto } from './dto/DepositoCobroDTO.dto';
import { UpdateMetaCobroDto } from './dto/update-meta-cobro.dto';

@Controller('metas')
export class MetasController {
  constructor(private readonly metasService: MetasService) {}

  //CREAR UNA META PARA UN VENDEDOR O USUARIO
  @Post()
  create(@Body() createMetaDTO: CreateMetaUsuarioDto) {
    return this.metasService.createSellerGoal(createMetaDTO);
  }

  @Post('/regist-new-meta-cobros')
  createNewGoalCobros(@Body() createMetaCobro: CreateMetaCobrosDto) {
    return this.metasService.createNewGoalCobros(createMetaCobro);
  }

  //REGISTRAR NUEVOS COBROS O DEPOSITOS

  @Post('/create-new-payment-cobros')
  createNewPaymentCobro(@Body() createDepositoDTO: CreateDepositoCobroDto) {
    return this.metasService.createNewPaymentCobro(createDepositoDTO);
  }

  //CONSEGUIR LOS REGISTROS DE MI SUCURSAL CORRESPONDIENTE

  @Get('/get-all-cobros-metas/:id')
  findAllCobrosMetas(@Param('id', ParseIntPipe) id: number) {
    return this.metasService.findAllCobrosMetas(id);
  }

  @Get('/get-all-metas-to-summary')
  findAllMetasToSummary() {
    return this.metasService.findAllMetasToSummary();
  }

  @Get('/get-all-seller-goals/:id')
  findAllSellerGoal(@Param('id', ParseIntPipe) id: number) {
    return this.metasService.findAllSellerGoal();
  }

  @Get('/get-all-my-goals/:id')
  getMyGoalsAndMore(@Param('id', ParseIntPipe) id: number) {
    return this.metasService.getMyGoalsAndMore(id);
  }

  @Get('/delete-all')
  deleteAll() {
    return this.metasService.deleteAll();
  }

  @Get('/get-all-metas-users')
  deleteAllMetasUsers() {
    return this.metasService.deleteAllMetasUsers();
  }

  @Patch('/update-one-meta/:id')
  updateMetaTienda(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMetaDto: UpdateMetaDto,
  ) {
    console.log('Entrando al service update');

    return this.metasService.updateMetaTienda(id, updateMetaDto);
  }

  @Patch('/update-one-meta-cobro/:id')
  updateMetaCobros(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMetaDto: UpdateMetaCobroDto,
  ) {
    return this.metasService.updateMetaCobros(id, updateMetaDto);
  }

  @Delete('/delete-one-payment/:metaId/:id')
  removeOneDepo(
    @Param('metaId', ParseIntPipe) metaId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.metasService.removeOneDepo(metaId, id);
  }

  @Delete('/delete-one-goal/:id/:adminId')
  removeOneGoal(
    @Param('id', ParseIntPipe) id: number, // Recibe el ID desde la URL
    @Param('adminId', ParseIntPipe) adminId: number, // Recibe el ID ADMIN
    @Body('passwordAdmin') passwordAdmin: string, // Recibe la contraseña desde el cuerpo
  ) {
    return this.metasService.removeOneGoal(id, adminId, passwordAdmin); // Llama al servicio con el ID y la contraseña
  }

  @Delete('/delete-one-cobro-goal/:id/:adminId')
  removeOneCobroMeta(
    @Param('id', ParseIntPipe) id: number, // Recibe el ID desde la URL
    @Param('adminId', ParseIntPipe) adminId: number, // Recibe el ID ADMIN
    @Body('passwordAdmin') passwordAdmin: string, // Recibe la contraseña desde el cuerpo
  ) {
    return this.metasService.removeOneCobroMeta(id, adminId, passwordAdmin); // Llama al servicio con el ID y la contraseña
  }
}
