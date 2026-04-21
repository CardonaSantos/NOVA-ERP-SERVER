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
} from '@nestjs/common';
import { CajaService } from './caja.service';
import { IniciarCaja } from './dto/open-regist.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CerrarCajaDto } from './dto/CerrarCajaDto';
import { CerrarCajaV2Dto } from './cerrarCajaTypes';
import { GetCajasQueryDto } from './GetCajasQueryDto ';
import { getCajasToCompraDto } from './getCajasToCompra.dto';
import { CerrarCajaV3Dto } from './dto/CerrarCajaV3Dto';

@Controller('caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) {}

  //ABRIR EL REGISTRO DE CAJA [TURNO]
  @Post('/iniciar-caja')
  createRegistCash(@Body() createCajaDto: IniciarCaja) {
    return this.cajaService.iniciarCaja(createCajaDto);
  }

  @Post('/cerrar-v3')
  newCerrarCaja(@Body() dto: CerrarCajaV3Dto) {
    return this.cajaService.cerrarCajaV3(dto);
  }

  @Patch('/cerrar-caja')
  create(@Body() dto: CerrarCajaV3Dto) {
    return this.cajaService.cerrarCajaV3(dto);
  }

  @Get('/get-ultimo-saldo-usuario/:sucursalID/:userID')
  getUltimoSaldoUsuario(
    @Param('sucursalID', ParseIntPipe) sucursalID: number,
    @Param('userID', ParseIntPipe) userID: number,
  ) {
    return this.cajaService.getUltimoSaldoUsuario(sucursalID, userID);
  }

  @Get('previa-cierre')
  getPreviaCierre(
    @Query()
    q: {
      registroCajaId?: string;
      sucursalId?: string;
      usuarioId?: string;
    },
  ) {
    const registroCajaId = q.registroCajaId
      ? Number(q.registroCajaId)
      : undefined;
    const sucursalId = q.sucursalId ? Number(q.sucursalId) : undefined;
    const usuarioId = q.usuarioId ? Number(q.usuarioId) : undefined;

    return this.cajaService.previewCierre({
      registroCajaId,
      sucursalId,
      usuarioId,
    });
  }

  //CONSEGUIR REGISTRO DE CAJA SIN CERRAR DE MI USUSARIO EN CIERTA SUCURSAL
  @Get('/find-cash-regist-open/:sucursalID/:userID')
  findOpenCashRegist(
    @Param('sucursalID', ParseIntPipe) sucursalID: number,
    @Param('userID', ParseIntPipe) userID: number,
  ) {
    const dto = {
      sucursalID: sucursalID,
      userID: userID,
    };
    return this.cajaService.conseguirCajaAbierta(dto.sucursalID, dto.userID);
  }

  @Get('/get-previo-cierre/:sucursalID/:userID')
  getMontoPrevio(
    @Param('sucursalID', ParseIntPipe) sucursalID: number,
    @Param('userID', ParseIntPipe) userID: number,
  ) {
    const dto = {
      sucursalId: sucursalID,
      usuarioId: userID,
    };
    return this.cajaService.previewCierre(dto);
  }

  //CONSEGUIR REGISTRO DE CAJA SIN CERRAR DE MI USUSARIO EN CIERTA SUCURSAL
  @Get('/get-cajas-registros')
  getCajasRegistros() {
    return this.cajaService.getCajasRegistros();
  }

  @Get('/get-cajas-registros-ventas/:id')
  getVentasDeCaja(@Param('id', ParseIntPipe) id: number) {
    return this.cajaService.getVentasLigadasACaja(id);
  }

  @Get('/get-all-cajas')
  getAllCajas() {
    return this.cajaService.getAllCajas();
  }

  @Delete('/delete-all')
  deletAllCajas() {
    return this.cajaService.deleteAllCajas();
  }

  @Get('list-cajas')
  list(@Query() dto: GetCajasQueryDto) {
    return this.cajaService.list(dto);
  }

  @Get('cajas-disponibles/:id')
  getCajasDisponiblesToCompra(@Param('id', ParseIntPipe) id: number) {
    return this.cajaService.getCajasAbiertasToCompra(id);
  }
}
