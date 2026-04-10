import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { CajaAdministrativoService } from './caja-administrativo.service';
import { dayjs } from 'src/utils/dayjs';
import { TZGT } from 'src/utils/utils';

@Controller('caja-administrativo')
export class CajaAdministrativoController {
  constructor(
    private readonly cajaAdministrativoService: CajaAdministrativoService,
  ) {}

  /**
   * Flujo cajas por sucursal
   * @param sucursalId
   * @param from
   * @param to
   * @returns
   */
  @Get('sucursal/:sucursalId')
  async flujoSucursal(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Query('from') from?: string, // YYYY-MM-DD
    @Query('to') to?: string, // YYYY-MM-DD
  ) {
    const fromDate = from
      ? dayjs.tz(from, 'YYYY-MM-DD', TZGT).startOf('day').toDate()
      : dayjs().tz(TZGT).startOf('month').toDate();

    const toDate = to
      ? dayjs.tz(to, 'YYYY-MM-DD', TZGT).endOf('day').toDate()
      : dayjs().tz(TZGT).endOf('day').toDate();

    if (
      !dayjs(fromDate).isValid() ||
      !dayjs(toDate).isValid() ||
      fromDate > toDate
    ) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    return this.cajaAdministrativoService.getFlujoSucursal({
      sucursalId,
      from: fromDate,
      to: toDate,
    });
  }

  /**
   * Flujos cajas global
   * @param from
   * @param to
   * @returns
   */
  @Get('global')
  async flujoGlobal(
    @Query('from') from?: string, // YYYY-MM-DD
    @Query('to') to?: string, // YYYY-MM-DD
  ) {
    const fromDate = from
      ? dayjs.tz(from, 'YYYY-MM-DD', TZGT).startOf('day').toDate()
      : dayjs().tz(TZGT).startOf('month').toDate();

    const toDate = to
      ? dayjs.tz(to, 'YYYY-MM-DD', TZGT).endOf('day').toDate()
      : dayjs().tz(TZGT).endOf('day').toDate();

    if (
      !dayjs(fromDate).isValid() ||
      !dayjs(toDate).isValid() ||
      fromDate > toDate
    ) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    return this.cajaAdministrativoService.getFlujoGlobal({
      from: fromDate,
      to: toDate,
    });
  }

  /**
   * Costos ventas historicos => REFACTORIZADO
   * @param sucursalId
   * @param from
   * @param to
   * @returns
   */
  @Get('costos-venta-historico')
  async costosVentaHistorico(
    @Query('sucursalId') sucursalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.cajaAdministrativoService.getCostosVentaHistorico({
      sucursalId: sucursalId ? Number(sucursalId) : undefined,
      from,
      to,
    });
  }

  /**
   * Gastos operativos  historicos => REFACTORIZADO
   * @param sucursalId
   * @param from
   * @param to
   * @returns
   */
  @Get('gastos-operativos')
  async gastosOperativos(
    @Query('sucursalId') sucursalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dto = {
      sucursalId: sucursalId ? Number(sucursalId) : undefined,
      from: from
        ? dayjs.tz(from, 'YYYY-MM-DD', TZGT).startOf('day').toDate()
        : dayjs().tz(TZGT).startOf('month').toDate(),
      to: to
        ? dayjs.tz(to, 'YYYY-MM-DD', TZGT).endOf('day').toDate()
        : dayjs().tz(TZGT).endOf('day').toDate(),
    };

    return this.cajaAdministrativoService.getGastosOperativos(dto);
  }

  /**
   * Flujo efectivo => refactorizado
   * @param sucursalId
   * @param from
   * @param to
   * @returns
   */
  @Get('flujo-efectivo')
  async flujoEfectivo(
    @Query('sucursalId') sucursalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const sucId = sucursalId ? Number(sucursalId) : undefined;

    const fromDate = from
      ? dayjs.tz(from, 'YYYY-MM-DD', TZGT).startOf('day').toDate()
      : dayjs().tz(TZGT).startOf('month').toDate();

    const toDate = to
      ? dayjs.tz(to, 'YYYY-MM-DD', TZGT).endOf('day').toDate()
      : dayjs().tz(TZGT).endOf('day').toDate();

    if (!dayjs(fromDate).isValid() || !dayjs(toDate).isValid()) {
      throw new BadRequestException('Fechas inválidas');
    }

    return this.cajaAdministrativoService.getFlujoEfectivo({
      sucursalId: sucId,
      from: fromDate,
      to: toDate,
    });
  }

  /** estados resultados => nuevo a hacer UI
   * GET /finanzas/estado-resultados?sucursalId=1&from=2025-08-01&to=2025-08-31
   */
  @Get('estado-resultados')
  async estadoResultados(
    @Query('sucursalId') sucursalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const sid = sucursalId ? Number(sucursalId) : undefined;
    return this.cajaAdministrativoService.getEstadoResultados({
      sucursalId: sid,
      from,
      to,
    });
  }
}
