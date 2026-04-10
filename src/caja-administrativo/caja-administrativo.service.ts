import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CapitalInicialQueryDto,
  CapitalInicialResponse,
} from './dto/capital-inicial.dto';
import { TZGT } from 'src/utils/utils';
import { dayjs } from 'src/utils/dayjs';
import {
  CostoAsociadoTipo,
  CV_Detalle,
  CV_PorDia,
  CV_Resumen,
  DetalleFlujo,
  DetalleMovimiento,
  DireccionTransfer,
  GO_Detalle,
  GO_PorDia,
  GO_Resumen,
  PorDiaFlujo,
  PorDiaItem,
  ResumenPeriodoFlujo,
} from './interfaces';
import { CostoVentaTipo, GastoOperativoTipo } from '@prisma/client';

function N(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toString === 'function') return Number(v.toString());
  return Number(v) || 0;
}

@Injectable()
export class CajaAdministrativoService {
  private readonly logger = new Logger(CajaAdministrativoService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getCapitalInicialSugerido(
    q: CapitalInicialQueryDto,
  ): Promise<CapitalInicialResponse> {
    const sucursalId = Number(q.sucursalId);
    if (!sucursalId || Number.isNaN(sucursalId)) {
      throw new BadRequestException('sucursalId inválido');
    }
    const ajustarDepositos = q.ajustarDepositosCierre ?? true;

    const aperturaDia = q.fecha ? dayjs.tz(q.fecha, TZGT) : dayjs().tz(TZGT);
    const aperturaStart = aperturaDia.startOf('day').toDate();

    // 1) Último cierre previo a la fecha
    const lastClosed = await this.prisma.registroCaja.findFirst({
      where: {
        sucursalId,
        estado: 'CERRADO',
        fechaApertura: { lt: aperturaStart },
      },
      orderBy: { fechaCierre: 'desc' },
      select: {
        id: true,
        fechaCierre: true,
        saldoFinal: true,
        fondoFijo: true,
        depositado: true,
      },
    });

    if (!lastClosed) {
      return {
        sucursalId,
        fecha: aperturaStart.toISOString(),
        saldoInicialSugerido: 0,
        criterio: 'SIN_CIERRE_PREVIO',
        contexto: {
          ultimoCierreId: null,
          ultimoCierreFecha: null,
          saldoFinalAnterior: null,
          fondoFijoAnterior: null,
          depositoCierreDetectado: false,
        },
      };
    }

    // 2) ¿Hubo depósito de cierre entre el cierre y la nueva apertura?
    let depositoCierreDetectado = false;
    if (ajustarDepositos) {
      const agg = await this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: {
          sucursalId,
          esDepositoCierre: true,
          fecha: {
            gt: lastClosed.fechaCierre ?? lastClosed['fechaApertura'],
            lt: aperturaStart,
          },
        },
      });
      const sumDeltaCaja = Number(agg._sum.deltaCaja ?? 0);
      depositoCierreDetectado =
        Math.abs(sumDeltaCaja) > 0 || !!lastClosed.depositado;
    }

    // 3) Criterio de sugerencia
    const saldoFinalAnterior = Number(lastClosed.saldoFinal ?? 0);
    const fondoFijoAnterior = Number(lastClosed.fondoFijo ?? 0);

    const usarFondoFijo = depositoCierreDetectado;
    const saldoInicialSugerido = usarFondoFijo
      ? fondoFijoAnterior
      : saldoFinalAnterior;

    return {
      sucursalId,
      fecha: aperturaStart.toISOString(),
      saldoInicialSugerido,
      criterio: usarFondoFijo
        ? 'FONDO_FIJO_POR_DEPOSITO'
        : 'ARRASTRE_SALDO_FINAL',
      contexto: {
        ultimoCierreId: lastClosed.id,
        ultimoCierreFecha:
          (lastClosed.fechaCierre as Date | null)?.toISOString?.() ?? null,
        saldoFinalAnterior,
        fondoFijoAnterior,
        depositoCierreDetectado,
      },
    };
  }

  async getFlujoSucursal(dto: { sucursalId: number; from: Date; to: Date }) {
    const { sucursalId, from, to } = dto;

    const rows = await this.prisma.sucursalSaldoDiario.findMany({
      where: { sucursalId, fecha: { gte: from, lte: to } },
      orderBy: { fecha: 'asc' },
    });

    // Mapeo compatible + campos derivados y fecha en TZ GT
    const data = rows.map((r) => {
      const saldoInicioCaja = N(r.saldoInicioCaja);
      const ingresosCaja = N(r.ingresosCaja);
      const egresosCaja = N(r.egresosCaja);
      const saldoFinalCaja = N(r.saldoFinalCaja);

      const saldoInicioBanco = N(r.saldoInicioBanco);
      const ingresosBanco = N(r.ingresosBanco);
      const egresosBanco = N(r.egresosBanco);
      const saldoFinalBanco = N(r.saldoFinalBanco);

      const movimientoNetoCaja = ingresosCaja - egresosCaja;
      const movimientoNetoBanco = ingresosBanco - egresosBanco;
      const variacionNetaDia = movimientoNetoCaja + movimientoNetoBanco;

      const fechaIso = r.fecha.toISOString();
      const fechaDia = dayjs(r.fecha).tz(TZGT).format('YYYY-MM-DD');

      return {
        // (compat)
        fecha: fechaIso,
        saldoInicioCaja,
        ingresosCaja,
        egresosCaja,
        saldoFinalCaja,
        saldoInicioBanco,
        ingresosBanco,
        egresosBanco,
        saldoFinalBanco,

        // (nuevo, no rompe)
        fechaIso,
        fechaDia,
        saldoInicioTotal: saldoInicioCaja + saldoInicioBanco,
        saldoFinalTotal: saldoFinalCaja + saldoFinalBanco,
        movimientoNetoCaja,
        movimientoNetoBanco,
        variacionNetaDia,
      };
    });

    return data;
  }

  async getFlujoGlobal(dto: { from: Date; to: Date }) {
    const rows = await this.prisma.saldoGlobalDiario.findMany({
      where: { fecha: { gte: dto.from, lte: dto.to } },
      orderBy: { fecha: 'asc' },
    });

    return rows.map((r) => {
      const saldoTotalCaja = N(r.saldoTotalCaja);
      const ingresosTotalCaja = N(r.ingresosTotalCaja);
      const egresosTotalCaja = N(r.egresosTotalCaja);

      const saldoTotalBanco = N(r.saldoTotalBanco);
      const ingresosTotalBanco = N(r.ingresosTotalBanco);
      const egresosTotalBanco = N(r.egresosTotalBanco);

      const movimientoNetoCajaTotal = ingresosTotalCaja - egresosTotalCaja;
      const movimientoNetoBancoTotal = ingresosTotalBanco - egresosTotalBanco;
      const movimientoNetoTotal =
        movimientoNetoCajaTotal + movimientoNetoBancoTotal;

      const fechaIso = r.fecha.toISOString();
      const fechaDia = dayjs(r.fecha).tz(TZGT).format('YYYY-MM-DD');

      return {
        fecha: fechaIso, // (compat)
        saldoTotalCaja,
        ingresosTotalCaja,
        egresosTotalCaja,
        saldoTotalBanco,
        ingresosTotalBanco,
        egresosTotalBanco,

        // (nuevo)
        fechaIso,
        fechaDia,
        saldoTotal: saldoTotalCaja + saldoTotalBanco,
        movimientoNetoCajaTotal,
        movimientoNetoBancoTotal,
        movimientoNetoTotal,
      };
    });
  }

  /**
   * Costos ventas historicos => refactorizando
   * @param dto
   * @returns
   */
  async getCostosVentaHistorico(dto: {
    sucursalId?: number;
    from?: string | Date;
    to?: string | Date;
  }) {
    const { sucursalId } = dto;

    const fechaFrom = dto.from
      ? dayjs(dto.from).tz(TZGT).startOf('day').toDate()
      : dayjs().tz(TZGT).startOf('month').toDate();

    const fechaTo = dto.to
      ? dayjs(dto.to).tz(TZGT).endOf('day').toDate()
      : dayjs().tz(TZGT).endOf('day').toDate();

    if (
      !dayjs(fechaFrom).isValid() ||
      !dayjs(fechaTo).isValid() ||
      fechaFrom > fechaTo
    ) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    const rows = await this.prisma.movimientoFinanciero.findMany({
      where: {
        clasificacion: 'COSTO_VENTA',
        ...(sucursalId ? { sucursalId } : {}),
        fecha: { gte: fechaFrom, lte: fechaTo },
      },
      orderBy: { fecha: 'asc' },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
      },
    });

    // 1) Detalle (monto robusto + TZ + tipificación con fallback)
    const detalle: CV_Detalle[] = rows.map((r) => {
      const deltaCaja = N(r.deltaCaja);
      const deltaBanco = N(r.deltaBanco);
      const egresoCaja = Math.max(0, -deltaCaja);
      const egresoBanco = Math.max(0, -deltaBanco);
      const monto = egresoCaja + egresoBanco;

      // Prioriza costoVentaTipo; si no viene, usa motivo como respaldo
      let tipoFinal: CostoVentaTipo = 'OTROS';
      const t = (r.costoVentaTipo as CostoVentaTipo | null) ?? null;
      if (t) {
        tipoFinal = t;
      } else if (r.motivo === 'COMPRA_MERCADERIA') {
        tipoFinal = 'MERCADERIA';
      } else if (r.motivo === 'COSTO_ASOCIADO') {
        tipoFinal = 'OTROS';
      }

      return {
        id: r.id,
        fecha: r.fecha.toISOString(),
        fechaDia: dayjs(r.fecha).tz(TZGT).format('YYYY-MM-DD'),
        sucursal: r.sucursal ?? null,
        proveedor: r.proveedor ?? null,
        tipo: tipoFinal,
        motivo: r.motivo ?? null,
        conFactura: r.conFactura ?? false,
        deltaCaja,
        deltaBanco,
        egresoCaja,
        egresoBanco,
        monto,
        descripcion: r.descripcion ?? '',
        referencia: r.referencia ?? '',
      };
    });

    // 2) Resumen (categoría, canal, factura, top proveedores)
    const zeros = {
      MERCADERIA: 0,
      FLETE: 0,
      ENCOMIENDA: 0,
      TRANSPORTE: 0,
      OTROS: 0,
    } as Record<CostoVentaTipo, number>;
    let totalGeneral = 0;
    let caja = 0,
      banco = 0;
    let conFactura = 0,
      sinFactura = 0;
    const porCategoria: Record<CostoVentaTipo, number> = { ...zeros };
    const porProveedor = new Map<number, { nombre: string; total: number }>();

    for (const d of detalle) {
      totalGeneral += d.monto;
      caja += d.egresoCaja;
      banco += d.egresoBanco;
      if (d.conFactura) conFactura += d.monto;
      else sinFactura += d.monto;
      porCategoria[d.tipo] += d.monto;

      if (d.proveedor) {
        const prev = porProveedor.get(d.proveedor.id) ?? {
          nombre: d.proveedor.nombre,
          total: 0,
        };
        prev.total += d.monto;
        porProveedor.set(d.proveedor.id, prev);
      }
    }

    const proveedoresTop = [...porProveedor.entries()]
      .map(([proveedorId, v]) => ({
        proveedorId,
        nombre: v.nombre,
        total: v.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const resumen: CV_Resumen = {
      totalGeneral,
      porCategoria,
      porCanal: { caja, banco },
      porFactura: { conFactura, sinFactura },
      proveedoresTop,
    };

    // 3) Por día (TZ Guatemala)
    const porDiaMap = new Map<string, CV_PorDia>();
    const ensureDia = (key: string) => {
      if (!porDiaMap.has(key)) {
        porDiaMap.set(key, {
          fecha: key,
          total: 0,
          caja: 0,
          banco: 0,
          MERCADERIA: 0,
          FLETE: 0,
          ENCOMIENDA: 0,
          TRANSPORTE: 0,
          OTROS: 0,
        });
      }
      return porDiaMap.get(key)!;
    };

    for (const d of detalle) {
      const row = ensureDia(d.fechaDia);
      row.total += d.monto;
      row.caja += d.egresoCaja;
      row.banco += d.egresoBanco;
      row[d.tipo] += d.monto;
    }

    const porDia = Array.from(porDiaMap.values()).sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );

    // 4) Metadatos (consistencia con otros endpoints)
    let sucursalInfo: { id: number; nombre: string } | null = null;
    if (sucursalId) {
      const s = await this.prisma.sucursal.findUnique({
        where: { id: sucursalId },
        select: { id: true, nombre: true },
      });
      if (s) sucursalInfo = s;
    }

    return {
      periodo: {
        from: dayjs(fechaFrom).tz(TZGT).format(),
        to: dayjs(fechaTo).tz(TZGT).format(),
        timezone: TZGT,
      },
      sucursal: sucursalInfo,
      resumen,
      porDia,
      detalle,
    };
  }

  /**
   *
   * @param dto sucursal, form y to
   * @returns Gastos operativos por fechas
   */
  async getGastosOperativos(dto: {
    sucursalId?: number;
    from: Date;
    to: Date;
  }) {
    const { sucursalId, from, to } = dto;

    const fechaFrom = dayjs(from).tz(TZGT).startOf('day').toDate();
    const fechaTo = dayjs(to).tz(TZGT).endOf('day').toDate();

    // 1) Solo GASTO_OPERATIVO en el rango/sucursal
    const rows = await this.prisma.movimientoFinanciero.findMany({
      where: {
        clasificacion: 'GASTO_OPERATIVO',
        fecha: { gte: fechaFrom, lte: fechaTo },
        ...(sucursalId ? { sucursalId } : {}),
      },
      orderBy: { fecha: 'asc' },
      select: {
        id: true,
        fecha: true,
        sucursal: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
        gastoOperativoTipo: true,
        deltaCaja: true,
        deltaBanco: true,
        descripcion: true,
        referencia: true,
        conFactura: true,
      },
    });

    // 2) Mapear detalle (robusto con Decimal y TZ)
    const detalle: GO_Detalle[] = rows.map((r) => {
      const deltaCaja = N(r.deltaCaja);
      const deltaBanco = N(r.deltaBanco);

      const egresoCaja = Math.max(0, -deltaCaja);
      const egresoBanco = Math.max(0, -deltaBanco);

      return {
        id: r.id,
        fecha: r.fecha.toISOString(),
        fechaDia: dayjs(r.fecha).tz(TZGT).format('YYYY-MM-DD'),
        sucursal: r.sucursal ?? null,
        proveedor: r.proveedor ?? null,
        tipo: (r.gastoOperativoTipo as GastoOperativoTipo | null) ?? null,
        conFactura: r.conFactura ?? false,

        deltaCaja,
        deltaBanco,
        egresoCaja,
        egresoBanco,
        monto: egresoCaja + egresoBanco,

        descripcion: r.descripcion ?? '',
        referencia: r.referencia ?? '',
      };
    });

    // 3) Resumen del periodo
    const blankCats: Record<GastoOperativoTipo, number> = {
      SALARIO: 0,
      ENERGIA: 0,
      LOGISTICA: 0,
      RENTA: 0,
      INTERNET: 0,
      PUBLICIDAD: 0,
      VIATICOS: 0,
      OTROS: 0,
    };

    let totalGeneral = 0;
    let totalCaja = 0;
    let totalBanco = 0;
    let conFactura = 0;
    let sinFactura = 0;
    const porCategoria: Record<GastoOperativoTipo, number> = { ...blankCats };
    const porProveedorMap = new Map<
      number,
      { nombre: string; total: number }
    >();

    for (const d of detalle) {
      totalGeneral += d.monto;
      totalCaja += d.egresoCaja;
      totalBanco += d.egresoBanco;
      if (d.conFactura) conFactura += d.monto;
      else sinFactura += d.monto;

      const cat = d.tipo ?? 'OTROS';
      porCategoria[cat] = (porCategoria[cat] ?? 0) + d.monto;

      if (d.proveedor) {
        const prev = porProveedorMap.get(d.proveedor.id) ?? {
          nombre: d.proveedor.nombre,
          total: 0,
        };
        prev.total += d.monto;
        porProveedorMap.set(d.proveedor.id, prev);
      }
    }

    const proveedoresTop = [...porProveedorMap.entries()]
      .map(([proveedorId, v]) => ({
        proveedorId,
        nombre: v.nombre,
        total: v.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const resumen: GO_Resumen = {
      totalGeneral,
      porCategoria,
      porCanal: { caja: totalCaja, banco: totalBanco },
      porFactura: { conFactura, sinFactura },
      proveedoresTop,
    };

    // 4) Agrupado por día (TZ Guatemala) + breakdown por canal y categoría
    const porDiaMap = new Map<string, GO_PorDia>();

    const ensureDia = (key: string) => {
      if (!porDiaMap.has(key)) {
        porDiaMap.set(key, {
          fecha: key,
          total: 0,
          caja: 0,
          banco: 0,
          ...{ ...blankCats },
        } as GO_PorDia);
      }
      return porDiaMap.get(key)!;
    };

    for (const d of detalle) {
      const row = ensureDia(d.fechaDia);
      row.total += d.monto;
      row.caja += d.egresoCaja;
      row.banco += d.egresoBanco;
      const cat = d.tipo ?? 'OTROS';
      (row as any)[cat] = ((row as any)[cat] ?? 0) + d.monto;
    }

    const porDia = Array.from(porDiaMap.values()).sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );

    // 5) Metadatos (opcional)
    let sucursalInfo: { id: number; nombre: string } | null = null;
    if (sucursalId) {
      const s = await this.prisma.sucursal.findUnique({
        where: { id: sucursalId },
        select: { id: true, nombre: true },
      });
      if (s) sucursalInfo = s;
    }

    return {
      periodo: {
        from: dayjs(fechaFrom).tz(TZGT).format(),
        to: dayjs(fechaTo).tz(TZGT).format(),
        timezone: TZGT,
      },
      sucursal: sucursalInfo,
      resumen,
      porDia,
      detalle,
    };
  }

  /**
   * FLUJO DE EFECTIVO (histórico por canal Efectivo/Banco, operativa Admin)
   * - Agrupa por día en TZ Guatemala.
   * - Separa TRANSFERENCIAS (Caja→Banco y Banco→Caja) para ver totales con/sin transfers.
   * - Mantiene el detalle con clasificacion/motivo para UI (depósitos de cierre/proveedor, etc.).
   * - No intenta calcular "saldos finales" contables; reporta variación del día (movimiento neto).
   */
  async getFlujoEfectivo(dto: { sucursalId?: number; from: Date; to: Date }) {
    const { sucursalId, from, to } = dto;

    const fechaFrom = dayjs(from).tz(TZGT).startOf('day').toDate();
    const fechaTo = dayjs(to).tz(TZGT).endOf('day').toDate();

    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where: {
        ...(sucursalId ? { sucursalId } : {}),
        fecha: { gte: fechaFrom, lte: fechaTo },
      },
      orderBy: { fecha: 'asc' },
      include: {
        sucursal: { select: { id: true, nombre: true } },
      },
    });

    // 1) Mapear detalle (marcando transferencias y su dirección)
    const detalle: DetalleFlujo[] = movimientos.map((m) => {
      const deltaCaja = N(m.deltaCaja);
      const deltaBanco = N(m.deltaBanco);
      const montoAbs = Math.abs(deltaCaja + deltaBanco);

      const esTransfer = m.clasificacion === 'TRANSFERENCIA';
      let direccion: DireccionTransfer | undefined;
      if (esTransfer) {
        if (deltaCaja < 0 && deltaBanco > 0) direccion = 'CAJA_A_BANCO';
        else if (deltaCaja > 0 && deltaBanco < 0) direccion = 'BANCO_A_CAJA';
      }

      return {
        id: m.id,
        fecha: m.fecha.toISOString(),
        sucursal: m.sucursal
          ? { id: m.sucursal.id, nombre: m.sucursal.nombre }
          : null,
        clasificacion: m.clasificacion ?? null,
        motivo: m.motivo ?? null,
        deltaCaja,
        deltaBanco,
        montoAbs,
        descripcion: m.descripcion ?? '',
        referencia: m.referencia ?? '',
        esTransferencia: esTransfer,
        direccionTransfer: direccion,
      };
    });

    // 2) Agrupar por día (TZGT) y acumular
    const porDiaMap = new Map<string, PorDiaFlujo>();

    const ensureDia = (dia: string) => {
      if (!porDiaMap.has(dia)) {
        porDiaMap.set(dia, {
          fecha: dia,
          ingresosCaja: 0,
          egresosCaja: 0,
          ingresosBanco: 0,
          egresosBanco: 0,
          transferCajaABanco: 0,
          transferBancoACaja: 0,
          movimientoNetoCaja: 0,
          movimientoNetoBanco: 0,
          movimientoNetoTotal: 0,
        });
      }
      return porDiaMap.get(dia)!;
    };

    for (const d of detalle) {
      const dia = dayjs(d.fecha).tz(TZGT).format('YYYY-MM-DD');
      const acc = ensureDia(dia);

      // Clasificación por signo/canal
      if (d.deltaCaja > 0) acc.ingresosCaja += d.deltaCaja;
      if (d.deltaCaja < 0) acc.egresosCaja += Math.abs(d.deltaCaja);
      if (d.deltaBanco > 0) acc.ingresosBanco += d.deltaBanco;
      if (d.deltaBanco < 0) acc.egresosBanco += Math.abs(d.deltaBanco);

      // Transferencias separadas
      if (d.esTransferencia && d.direccionTransfer === 'CAJA_A_BANCO') {
        acc.transferCajaABanco += Math.abs(d.deltaCaja); // (== d.deltaBanco)
      }
      if (d.esTransferencia && d.direccionTransfer === 'BANCO_A_CAJA') {
        acc.transferBancoACaja += Math.abs(d.deltaBanco); // (== d.deltaCaja)
      }

      // Variación neta del día por canal
      acc.movimientoNetoCaja += d.deltaCaja;
      acc.movimientoNetoBanco += d.deltaBanco;
      acc.movimientoNetoTotal += d.deltaCaja + d.deltaBanco;
    }

    const porDia = Array.from(porDiaMap.values()).sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );

    // 3) Resumen del período (con y sin transferencias)
    const resumen: ResumenPeriodoFlujo = porDia.reduce(
      (acc, d) => {
        acc.ingresosCaja += d.ingresosCaja;
        acc.egresosCaja += d.egresosCaja;
        acc.ingresosBanco += d.ingresosBanco;
        acc.egresosBanco += d.egresosBanco;
        acc.transferCajaABanco += d.transferCajaABanco;
        acc.transferBancoACaja += d.transferBancoACaja;

        acc.saldoNetoCaja_conTransfers += d.movimientoNetoCaja;
        acc.saldoNetoBanco_conTransfers += d.movimientoNetoBanco;

        // Para "sin transfers", restamos el efecto de transferencias de los ingresos/egresos
        // Caja→Banco: egreso de Caja y a la vez ingreso de Banco (quitar ambos)
        // Banco→Caja: egreso de Banco y a la vez ingreso de Caja (quitar ambos)
        const ingresosCaja_sin = d.ingresosCaja - d.transferBancoACaja; // banco->caja fue ingreso de caja
        const egresosCaja_sin = d.egresosCaja - d.transferCajaABanco; // caja->banco fue egreso de caja
        const ingresosBanco_sin = d.ingresosBanco - d.transferCajaABanco; // caja->banco fue ingreso de banco
        const egresosBanco_sin = d.egresosBanco - d.transferBancoACaja; // banco->caja fue egreso de banco

        acc.ingresosCaja_sinTransfers += ingresosCaja_sin;
        acc.egresosCaja_sinTransfers += egresosCaja_sin;
        acc.ingresosBanco_sinTransfers += ingresosBanco_sin;
        acc.egresosBanco_sinTransfers += egresosBanco_sin;

        // Neto sin transfers = (ingresos_sin - egresos_sin) por canal
        acc.saldoNetoCaja_sinTransfers += ingresosCaja_sin - egresosCaja_sin;
        acc.saldoNetoBanco_sinTransfers += ingresosBanco_sin - egresosBanco_sin;

        return acc;
      },
      {
        ingresosCaja: 0,
        egresosCaja: 0,
        ingresosBanco: 0,
        egresosBanco: 0,
        transferCajaABanco: 0,
        transferBancoACaja: 0,
        saldoNetoCaja_conTransfers: 0,
        saldoNetoBanco_conTransfers: 0,
        saldoNetoTotal_conTransfers: 0,
        ingresosCaja_sinTransfers: 0,
        egresosCaja_sinTransfers: 0,
        ingresosBanco_sinTransfers: 0,
        egresosBanco_sinTransfers: 0,
        saldoNetoCaja_sinTransfers: 0,
        saldoNetoBanco_sinTransfers: 0,
        saldoNetoTotal_sinTransfers: 0,
      } as ResumenPeriodoFlujo,
    );

    resumen.saldoNetoTotal_conTransfers =
      resumen.saldoNetoCaja_conTransfers + resumen.saldoNetoBanco_conTransfers;

    resumen.saldoNetoTotal_sinTransfers =
      resumen.saldoNetoCaja_sinTransfers + resumen.saldoNetoBanco_sinTransfers;

    return { resumen, porDia, detalle };
  }

  /**
   * Estado de Resultados (cash-basis con tus movimientos).
   * - Excluye TRANSFERENCIAS (puro flujo).
   * - Ingresa AJUSTES como bloque aparte (sobrantes/faltantes).
   * - No incluye créditos.
   * - Priorización en COSTO_VENTA: primero costoVentaTipo, luego motivo como fallback.
   */
  async getEstadoResultados(params: {
    sucursalId?: number;
    from?: string | Date;
    to?: string | Date;
  }) {
    const from = params.from
      ? dayjs(params.from).tz(TZGT).startOf('day').toDate()
      : dayjs().tz(TZGT).subtract(30, 'day').startOf('day').toDate();

    const to = params.to
      ? dayjs(params.to).tz(TZGT).endOf('day').toDate()
      : dayjs().tz(TZGT).endOf('day').toDate();

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    // Traemos TODO el periodo (por sucursal si se pide) y excluimos TRANSFERENCIAS
    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where: {
        ...(params.sucursalId ? { sucursalId: params.sucursalId } : {}),
        fecha: { gte: from, lte: to },
        clasificacion: { not: 'TRANSFERENCIA' },
      },
      orderBy: { fecha: 'asc' },
      include: {
        sucursal: { select: { id: true, nombre: true } },
      },
    });

    // Acumuladores
    let ventas = 0;
    let otrosIngresos = 0;
    let devoluciones = 0; // se resta

    let costoMercaderia = 0;

    const costoAsociado: Record<
      Exclude<CostoAsociadoTipo, 'MERCADERIA'>,
      number
    > = {
      FLETE: 0,
      ENCOMIENDA: 0,
      TRANSPORTE: 0,
      OTROS: 0,
    };

    const gastosOperativos: Record<GastoOperativoTipo, number> = {
      SALARIO: 0,
      ENERGIA: 0,
      LOGISTICA: 0,
      RENTA: 0,
      INTERNET: 0,
      PUBLICIDAD: 0,
      VIATICOS: 0,
      OTROS: 0,
    };

    let ajustesSobrantes = 0;
    let ajustesFaltantes = 0;

    // Detalle y agrupación por día
    const detalle: DetalleMovimiento[] = [];
    const porDiaMap: Record<string, PorDiaItem> = {};

    const ensureDia = (dia: string) => {
      if (!porDiaMap[dia]) {
        porDiaMap[dia] = {
          fecha: dia,
          ventas: 0,
          otrosIngresos: 0,
          devoluciones: 0,
          costoMercaderia: 0,
          costosAsociados: 0,
          gastosOperativos: 0,
          ajustes: 0,
          utilidadNetaDia: 0,
        };
      }
    };

    for (const m of movimientos) {
      const delta = N(m.deltaCaja) + N(m.deltaBanco);
      const abs = Math.abs(delta);
      const dia = dayjs(m.fecha).tz(TZGT).format('YYYY-MM-DD');
      ensureDia(dia);

      // Clasificación contable
      switch (m.clasificacion) {
        case 'INGRESO': {
          // Ventas y Otros Ingresos siempre con delta positivo
          if (m.motivo === 'VENTA' && delta > 0) {
            ventas += delta;
            porDiaMap[dia].ventas += delta;
          } else if (m.motivo === 'OTRO_INGRESO' && delta > 0) {
            otrosIngresos += delta;
            porDiaMap[dia].otrosIngresos += delta;
          }
          break;
        }

        case 'CONTRAVENTA': {
          // Devoluciones/contraventas con salida de dinero
          if (delta < 0) {
            devoluciones += abs;
            porDiaMap[dia].devoluciones += abs;
          }
          break;
        }

        case 'COSTO_VENTA': {
          if (delta < 0) {
            // 1) Prioriza costoVentaTipo
            const tipo = (m.costoVentaTipo as CostoAsociadoTipo | null) ?? null;

            if (tipo === 'MERCADERIA') {
              costoMercaderia += abs;
              porDiaMap[dia].costoMercaderia += abs;
            } else if (
              tipo === 'FLETE' ||
              tipo === 'ENCOMIENDA' ||
              tipo === 'TRANSPORTE' ||
              tipo === 'OTROS'
            ) {
              costoAsociado[tipo] += abs;
              porDiaMap[dia].costosAsociados += abs;
            } else {
              // 2) Fallback por motivo si no hay tipo explícito
              if (m.motivo === 'COMPRA_MERCADERIA') {
                costoMercaderia += abs;
                porDiaMap[dia].costoMercaderia += abs;
              } else if (m.motivo === 'COSTO_ASOCIADO') {
                // Si no vino tipo, clasifícalo como OTROS
                costoAsociado.OTROS += abs;
                porDiaMap[dia].costosAsociados += abs;
              } else {
                // Fallback final seguro
                costoAsociado.OTROS += abs;
                porDiaMap[dia].costosAsociados += abs;
              }
            }
          }
          break;
        }

        case 'GASTO_OPERATIVO': {
          if (delta < 0) {
            const key =
              (m.gastoOperativoTipo as GastoOperativoTipo | null) ?? 'OTROS';
            gastosOperativos[key] += abs;
            porDiaMap[dia].gastosOperativos += abs;
          }
          break;
        }

        case 'AJUSTE': {
          if (m.motivo === 'AJUSTE_SOBRANTE' && delta > 0) {
            ajustesSobrantes += delta;
            porDiaMap[dia].ajustes += delta;
          } else if (m.motivo === 'AJUSTE_FALTANTE' && delta < 0) {
            ajustesFaltantes += abs;
            porDiaMap[dia].ajustes -= abs;
          }
          break;
        }

        default:
          // TRANSFERENCIA ya está excluida en el where
          break;
      }

      // Detalle plano
      detalle.push({
        id: m.id,
        fecha: m.fecha.toISOString(),
        sucursal: m.sucursal
          ? { id: m.sucursal.id, nombre: m.sucursal.nombre }
          : null,
        clasificacion: m.clasificacion ?? '',
        motivo: m.motivo ?? null,
        costoVentaTipo: (m.costoVentaTipo as CostoAsociadoTipo | null) ?? null,
        gastoOperativoTipo:
          (m.gastoOperativoTipo as GastoOperativoTipo | null) ?? null,
        deltaCaja: N(m.deltaCaja),
        deltaBanco: N(m.deltaBanco),
        monto: abs,
        descripcion: m.descripcion ?? '',
        referencia: m.referencia ?? '',
        conFactura: m.conFactura ?? null,
      });
    }

    // Totales
    const ingresosNetos = ventas + otrosIngresos - devoluciones;

    const costosAsociadosTotal =
      costoAsociado.FLETE +
      costoAsociado.ENCOMIENDA +
      costoAsociado.TRANSPORTE +
      costoAsociado.OTROS;

    const costoVentasTotal = costoMercaderia + costosAsociadosTotal;

    const utilidadBruta = ingresosNetos - costoVentasTotal;

    const gastosOperativosTotal =
      gastosOperativos.SALARIO +
      gastosOperativos.ENERGIA +
      gastosOperativos.LOGISTICA +
      gastosOperativos.RENTA +
      gastosOperativos.INTERNET +
      gastosOperativos.PUBLICIDAD +
      gastosOperativos.VIATICOS +
      gastosOperativos.OTROS;

    const utilidadOperativa = utilidadBruta - gastosOperativosTotal;

    const ajustesNeto = ajustesSobrantes - ajustesFaltantes;

    const utilidadNeta = utilidadOperativa + ajustesNeto;

    // Cierre por día (ordenado asc por fecha)
    const porDia: PorDiaItem[] = Object.values(porDiaMap)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((d) => {
        const utilidadBrutaDia =
          d.ventas +
          d.otrosIngresos -
          d.devoluciones -
          (d.costoMercaderia + d.costosAsociados);
        const utilidadOperativaDia = utilidadBrutaDia - d.gastosOperativos;
        d.utilidadNetaDia = utilidadOperativaDia + d.ajustes;
        return d;
      });

    // Opcional: info sucursal
    let sucursalInfo: { id: number; nombre: string } | null = null;
    if (params.sucursalId) {
      const s = await this.prisma.sucursal.findUnique({
        where: { id: params.sucursalId },
        select: { id: true, nombre: true },
      });
      if (s) sucursalInfo = s;
    }

    return {
      periodo: {
        from: dayjs(from).tz(TZGT).format(),
        to: dayjs(to).tz(TZGT).format(),
        timezone: TZGT,
      },
      sucursal: sucursalInfo,
      resumen: {
        ingresos: {
          ventas,
          otrosIngresos,
          devoluciones,
          ingresosNetos,
        },
        costoVentas: {
          mercaderia: costoMercaderia,
          asociados: {
            flete: costoAsociado.FLETE,
            encomienda: costoAsociado.ENCOMIENDA,
            transporte: costoAsociado.TRANSPORTE,
            otros: costoAsociado.OTROS,
          },
          total: costoVentasTotal,
        },
        utilidadBruta,
        gastosOperativos: {
          ...gastosOperativos,
          total: gastosOperativosTotal,
        },
        utilidadOperativa,
        ajustes: {
          sobrantes: ajustesSobrantes,
          faltantes: ajustesFaltantes,
          neto: ajustesNeto,
        },
        utilidadNeta,
      },
      porDia,
      detalle,
    };
  }
}
