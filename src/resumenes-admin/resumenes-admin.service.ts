import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { dayBounds, n } from 'src/cron-snapshoot/helpers';
import { dayjs } from 'src/utils/dayjs';
import { TZGT } from 'src/utils/utils';
import { ResumenDiarioAdminResponse } from './interfaces';
import { MotivoMovimiento, Prisma } from '@prisma/client';

const num = (v: any) => Number(v ?? 0);
type DayWindow = { inicio: Date; fin: Date; dayStr: string };
const CASH_METHODS = ['EFECTIVO', 'CONTADO', 'CASH', 'CHEQUE']; // ajusta a tu catálogo
function N(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toString === 'function')
    return Number((v as any).toString());
  return Number(v) || 0;
}

// NUEVOS
type DaySlot = { dayStr: string; inicio: Date; fin: Date };

interface GetGlobalHistoricoParams {
  from?: string; // 'YYYY-MM-DD'
  to?: string; // 'YYYY-MM-DD'
  tz?: string; // por defecto TZGT
  sucursalId?: number;
}

type TzSpec =
  | { kind: 'iana'; zone: string }
  | { kind: 'offset'; minutes: number };

const TZ_DEFAULT = (typeof TZGT === 'string' && TZGT) || 'America/Guatemala';

function parseTz(tz?: string): TzSpec {
  if (!tz) return { kind: 'iana', zone: TZ_DEFAULT };
  if (tz.includes('/')) return { kind: 'iana', zone: tz }; // IANA
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const minutes = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
    return { kind: 'offset', minutes };
  }
  // fallback seguro
  return { kind: 'iana', zone: TZ_DEFAULT };
}

// clave para construir el rango día a día en la zona dada
function buildDayRange(from: string, to: string, spec: TzSpec) {
  const start =
    spec.kind === 'iana'
      ? dayjs.tz(from, spec.zone).startOf('day')
      : dayjs(from).utcOffset(spec.minutes).startOf('day');

  const end =
    spec.kind === 'iana'
      ? dayjs.tz(to, spec.zone).startOf('day')
      : dayjs(to).utcOffset(spec.minutes).startOf('day');

  const days: Array<{ dayStr: string; inicio: Date; fin: Date }> = [];
  for (
    let d = start.clone();
    d.isSame(end) || d.isBefore(end);
    d = d.add(1, 'day')
  ) {
    const inicio = d.startOf('day').toDate(); // UTC Date del inicio local
    const fin = d.endOf('day').toDate(); // UTC Date del fin local
    const dayStr =
      spec.kind === 'iana'
        ? d.tz(spec.zone).format('YYYY-MM-DD')
        : d.utcOffset(spec.minutes).format('YYYY-MM-DD');
    days.push({ dayStr, inicio, fin });
  }
  return days;
}

// normaliza cualquier Date a 'YYYY-MM-DD' en la zona dada
function dayKey(date: Date, spec: TzSpec) {
  return spec.kind === 'iana'
    ? dayjs(date).tz(spec.zone).format('YYYY-MM-DD')
    : dayjs(date).utcOffset(spec.minutes).format('YYYY-MM-DD');
}
// ---------- helpers ----------

// ---------- respuesta API ----------
export interface SaldosHistoricoResponse {
  rango: { from: string; to: string; tz: string; sucursalId?: number };
  days: Array<{
    fecha: string; // YYYY-MM-DD
    snapshotId: number | null;
    caja: { inicio: number; ingresos: number; egresos: number; final: number };
    banco: { inicio: number; ingresos: number; egresos: number; final: number };
    ventas: { total: number; cantidad: number };
    depositos: { monto: number; cantidad: number };
    flags: { sinSnapshot: boolean };
  }>;
  periodSummary: {
    caja: { ingresos: number; egresos: number; final: number };
    banco: { ingresos: number; egresos: number; final: number };
    ventas: { total: number; cantidad: number };
    depositos: { monto: number; cantidad: number };
  };
}
type HistoricoParams = {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
  tz?: string; // ej. '-06:00' (GT)
  sucursalId?: number; // si viene => histórico por sucursal; si no => GLOBAL
};

@Injectable()
export class ResumenesAdminService {
  private readonly UMBRAL_DESCUADRE = 0.01;
  private readonly logger = new Logger(ResumenesAdminService.name);
  constructor(private readonly prisma: PrismaService) {}

  //HELPERS
  // -------- Helpers --------
  private buildDayRange(
    fromISO: string,
    toISO: string,
    tz: string,
  ): DayWindow[] {
    const a = dayBounds(fromISO, tz).inicio;
    const b = dayBounds(toISO, tz).inicio;

    const days: DayWindow[] = [];
    for (
      let d = new Date(a);
      d.getTime() <= b.getTime();
      d.setDate(d.getDate() + 1)
    ) {
      const inicio = new Date(d);
      const fin = new Date(d);
      fin.setDate(fin.getDate() + 1);
      days.push({
        inicio,
        fin,
        dayStr: inicio.toISOString().slice(0, 10),
      });
    }
    return days;
  }

  private efectivoDesdeMetodos(porMetodo: Record<string, number>) {
    let total = 0;
    for (const k in porMetodo) {
      if (k === 'CONTADO' || k === 'EFECTIVO')
        total += Number(porMetodo[k] ?? 0);
    }
    return total;
  }

  // Heurística para identificar ventas en efectivo a partir de porMetodo
  calcularEfectivoDesdeMetodos(porMetodo: Record<string, number>) {
    let total = 0;
    for (const metodo in porMetodo) {
      switch (metodo) {
        case 'CONTADO':
        case 'EFECTIVO':
          total += Number(porMetodo[metodo] ?? 0);
          break;
        default:
          // no es efectivo en caja
          break;
      }
    }
    return total;
  }

  async panelAdminResumenDiario() {
    try {
    } catch (error) {
      this.logger.error('El error generado es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal Error: Error inesperado');
    }
  }

  async resumenDiarioAdmin(
    sucursalId: number,
    dateISO: string,
  ): Promise<ResumenDiarioAdminResponse> {
    // Helpers locales
    const N = (v: any) => Number(v ?? 0);

    // 1) Día TZ GT [00:00, 23:59:59]
    const day = dayjs.tz(dateISO.slice(0, 10), 'YYYY-MM-DD', TZGT);
    const inicio = day.startOf('day').toDate();
    const fin = day.endOf('day').toDate();

    const whereMov = { sucursalId, fecha: { gte: inicio, lte: fin } } as const;

    // 2) Sumatorias por canal (signo separado) — SIN filtros especiales
    const [cajaIn, cajaOut, banIn, banOut] = await Promise.all([
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { ...whereMov, deltaCaja: { gt: 0 } },
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: { ...whereMov, deltaCaja: { lt: 0 } },
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaBanco: true },
        where: { ...whereMov, deltaBanco: { gt: 0 } },
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaBanco: true },
        where: { ...whereMov, deltaBanco: { lt: 0 } },
      }),
    ]);

    const ingresosCaja = N(cajaIn._sum.deltaCaja);
    const egresosCaja = Math.abs(N(cajaOut._sum.deltaCaja));
    const ingresosBanco = N(banIn._sum.deltaBanco);
    const egresosBanco = Math.abs(N(banOut._sum.deltaBanco));

    // 3) Snapshot previo + aperturas del día (suma)
    const [snapPrev, aperturasAgg] = await Promise.all([
      this.prisma.sucursalSaldoDiario.findFirst({
        where: { sucursalId, fecha: { lt: inicio } },
        orderBy: { fecha: 'desc' },
        select: { saldoFinalCaja: true, saldoFinalBanco: true },
      }),
      this.prisma.registroCaja.aggregate({
        _sum: { saldoInicial: true },
        where: { sucursalId, fechaApertura: { gte: inicio, lte: fin } },
      }),
    ]);

    // Si hay snapshot, ese manda. Si NO, usa la SUMA de aperturas del día.
    const inicioCaja = snapPrev
      ? N(snapPrev.saldoFinalCaja)
      : N(aperturasAgg._sum.saldoInicial);

    const inicioBanco = N(snapPrev?.saldoFinalBanco ?? 0);

    // 4) Ventas y métodos
    const [ventasAgg, pagosGroup] = await Promise.all([
      this.prisma.venta.aggregate({
        where: { sucursalId, fechaVenta: { gte: inicio, lte: fin } },
        _sum: { totalVenta: true },
        _count: { _all: true },
      }),
      this.prisma.pago.groupBy({
        by: ['metodoPago'],
        where: {
          venta: { is: { sucursalId, fechaVenta: { gte: inicio, lte: fin } } },
        },
        _sum: { monto: true },
      }),
    ]);

    const ventasTotal = N(ventasAgg._sum.totalVenta);
    const ventasCantidad = N(ventasAgg._count._all);
    const ticketPromedio = ventasCantidad ? ventasTotal / ventasCantidad : 0;

    // 4.x) Efectivo por cobros de crédito (COBRO_CREDITO en caja)
    const cobroCreditoEfectivoAgg =
      await this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: {
          ...whereMov,
          motivo: MotivoMovimiento.COBRO_CREDITO,
          deltaCaja: { gt: 0 }, // efectivo entra a caja
        },
      });
    const efectivoCobrosCredito = Number(
      cobroCreditoEfectivoAgg._sum.deltaCaja ?? 0,
    );

    const porMetodo: Record<string, number> = {};
    for (const g of pagosGroup)
      porMetodo[g.metodoPago as string] = N(g._sum.monto);

    // Métodos que cuentan como "efectivo" (catálogo configurable)
    const efectivoVentas = CASH_METHODS.reduce(
      (acc, k) => acc + (porMetodo[k] ?? 0),
      0,
    );

    // 5) Egresos operativos (COSTO_VENTA / GASTO_OPERATIVO) por canal
    const [costosCajaAgg, costosBancoAgg, gastosCajaAgg, gastosBancoAgg] =
      await Promise.all([
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            ...whereMov,
            clasificacion: 'COSTO_VENTA',
            deltaCaja: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            ...whereMov,
            clasificacion: 'COSTO_VENTA',
            deltaBanco: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            ...whereMov,
            clasificacion: 'GASTO_OPERATIVO',
            deltaCaja: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            ...whereMov,
            clasificacion: 'GASTO_OPERATIVO',
            deltaBanco: { lt: 0 },
          },
        }),
      ]);

    const costosCaja = Math.abs(N(costosCajaAgg._sum.deltaCaja));
    const costosBanco = Math.abs(N(costosBancoAgg._sum.deltaBanco));
    const gastosCaja = Math.abs(N(gastosCajaAgg._sum.deltaCaja));
    const gastosBanco = Math.abs(N(gastosBancoAgg._sum.deltaBanco));

    // Sub-desglose: pagos a proveedor
    const [provCajaAgg, provBancoAgg] = await Promise.all([
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: {
          ...whereMov,
          clasificacion: 'COSTO_VENTA',
          motivo: {
            in: [
              MotivoMovimiento.DEPOSITO_PROVEEDOR,
              MotivoMovimiento.PAGO_PROVEEDOR_BANCO,
            ],
          },
          deltaCaja: { lt: 0 },
        } as Prisma.MovimientoFinancieroWhereInput,
      }),
      this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaBanco: true },
        where: {
          ...whereMov,
          clasificacion: 'COSTO_VENTA',
          motivo: {
            in: [
              MotivoMovimiento.DEPOSITO_PROVEEDOR,
              MotivoMovimiento.PAGO_PROVEEDOR_BANCO,
            ],
          },
          deltaBanco: { lt: 0 },
        } as Prisma.MovimientoFinancieroWhereInput,
      }),
    ]);
    const pagoProvCaja = Math.abs(N(provCajaAgg._sum.deltaCaja));
    const pagoProvBanco = Math.abs(N(provBancoAgg._sum.deltaBanco));

    // 6) Depósitos de CIERRE (Caja→Banco)
    const [depCount, depSumBanco, depSumCaja, depPorCuenta] = await Promise.all(
      [
        this.prisma.movimientoFinanciero.count({
          where: { ...whereMov, motivo: MotivoMovimiento.DEPOSITO_CIERRE },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            ...whereMov,
            motivo: MotivoMovimiento.DEPOSITO_CIERRE,
            deltaBanco: { gt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            ...whereMov,
            motivo: MotivoMovimiento.DEPOSITO_CIERRE,
            deltaCaja: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.groupBy({
          by: ['cuentaBancariaId'],
          where: {
            ...whereMov,
            motivo: MotivoMovimiento.DEPOSITO_CIERRE,
            deltaBanco: { gt: 0 },
          },
          _sum: { deltaBanco: true },
          _count: { _all: true },
        }),
      ],
    );

    const depositoCierreBanco = N(depSumBanco._sum.deltaBanco); // +++
    const depositoCierreCaja = Math.abs(N(depSumCaja._sum.deltaCaja)); // ---
    const cuentaIds = depPorCuenta
      .map((d) => d.cuentaBancariaId)
      .filter(Boolean) as number[];
    const cuentas = cuentaIds.length
      ? await this.prisma.cuentaBancaria.findMany({
          where: { id: { in: cuentaIds } },
          select: { id: true, banco: true, alias: true, numero: true },
        })
      : [];
    const porCuenta = depPorCuenta.map((d) => {
      const c = cuentas.find((x) => x.id === d.cuentaBancariaId);
      return {
        cuentaBancariaId: d.cuentaBancariaId!,
        banco: c?.banco ?? '—',
        alias: c?.alias ?? null,
        numeroMasked: c?.numero ? `****${c.numero.slice(-4)}` : null,
        monto: N(d._sum.deltaBanco),
        cantidad: N(d._count._all),
      };
    });

    // (Opcional) Banco→Caja del día
    const bancoACajaAgg = await this.prisma.movimientoFinanciero.aggregate({
      _sum: { deltaCaja: true },
      where: {
        ...whereMov,
        clasificacion: 'TRANSFERENCIA',
        deltaCaja: { gt: 0 },
        deltaBanco: { lt: 0 },
      },
    });
    const bancoACaja = N(bancoACajaAgg._sum.deltaCaja);

    // 7) Cálculos de saldos y cuadres
    const finalFisicoCaja = inicioCaja + ingresosCaja - egresosCaja;
    const egresosSinCierre = egresosCaja - depositoCierreCaja;
    const finalOperativoCaja = inicioCaja + ingresosCaja - egresosSinCierre;

    const cajaDisponible = inicioCaja + ingresosCaja - egresosSinCierre; // antes de depositar

    const finalBanco = inicioBanco + ingresosBanco - egresosBanco;

    const identidadCajaOk =
      Math.abs(finalFisicoCaja - (inicioCaja + ingresosCaja - egresosCaja)) <
      0.001;
    const identidadBancoOk =
      Math.abs(finalBanco - (inicioBanco + ingresosBanco - egresosBanco)) <
      0.001;

    // 7.1) Ingresos de Caja POR VENTAS (semáforo)
    // POS primero (excluye asientos)
    const posAgg = await this.prisma.movimientoFinanciero.aggregate({
      _sum: { deltaCaja: true },
      where: {
        ...whereMov,
        motivo: MotivoMovimiento.VENTA,
        esAsientoVentas: { not: true },
        deltaCaja: { gt: 0 },
      },
    });
    let ingresosCajaPorVentas = N(posAgg._sum.deltaCaja);
    let ingresosCajaPorVentasEstimado = false;

    if (ingresosCajaPorVentas === 0) {
      // Fallback 1: asiento por diferencia
      const asientoAgg = await this.prisma.movimientoFinanciero.aggregate({
        _sum: { deltaCaja: true },
        where: {
          ...whereMov,
          motivo: MotivoMovimiento.VENTA,
          esAsientoVentas: true,
          deltaCaja: { gt: 0 },
        },
      });
      ingresosCajaPorVentas = N(asientoAgg._sum.deltaCaja);

      // Fallback 2: pagos en efectivo (estimado)
      if (ingresosCajaPorVentas === 0 && efectivoVentas > 0) {
        ingresosCajaPorVentas = efectivoVentas;
        ingresosCajaPorVentasEstimado = true;
      }
    }

    // 7.2) Comparativos
    // const netoCajaOperativo = ingresosCaja - egresosSinCierre; // informativo
    // const variacionVsEfectivo = netoCajaOperativo - efectivoVentas; // informativo

    // 7.2) Comparativos (unificando POS + cobros de crédito en efectivo)
    const netoCajaOperativo = ingresosCaja - egresosSinCierre; // informativo

    // Lo que "esperamos" en caja por ventas: POS contado + cobros de crédito en efectivo
    const efectivoObjetivo = efectivoVentas + efectivoCobrosCredito;

    // Ingresos efectivos POS registrados en MF (sigue siendo solo Motivo: VENTA)
    const deltaVentasCajaVsEfectivo = ingresosCajaPorVentas - efectivoObjetivo; // semáforo principal

    // Informativo (si lo usas en la UI)
    const variacionVsEfectivo = netoCajaOperativo - efectivoObjetivo;

    const ventasOk = Math.abs(deltaVentasCajaVsEfectivo) <= 0.01;
    const excesoDeposito = Math.max(0, depositoCierreCaja - cajaDisponible);
    const depositoOk = excesoDeposito <= 0.01;

    const alertas: string[] = [];
    if (!ventasOk) {
      alertas.push(
        'Ingresos de caja por ventas no coincide con ventas en efectivo (incluye cobros de crédito).',
      );
    }
    if (!depositoOk) {
      alertas.push('Depósito de cierre mayor que la caja disponible');
    }
    if (!snapPrev && inicioCaja > 0) {
      alertas.push(
        `Sin snapshot previo. Inicio de caja asumido como suma de aperturas del día (Q ${inicioCaja.toFixed(2)}).`,
      );
    }

    // 8) Respuesta
    return {
      fecha: day.format('YYYY-MM-DD'),
      sucursalId,
      caja: {
        inicio: inicioCaja,
        ingresos: ingresosCaja,
        egresos: egresosCaja,
        finalFisico: finalFisicoCaja,
        egresosSinCierre,
        finalOperativo: finalOperativoCaja,
      },
      banco: {
        inicio: inicioBanco,
        ingresos: ingresosBanco,
        egresos: egresosBanco,
        final: finalBanco,
      },
      ventas: {
        total: ventasTotal,
        cantidad: ventasCantidad,
        ticketPromedio,
        porMetodo,
        efectivo: efectivoVentas,
        efectivoCobrosCredito, // ⬅️ NUEVO: cobros de crédito en efectivo
      },
      egresos: {
        costosVenta: {
          total: costosCaja + costosBanco,
          caja: costosCaja,
          banco: costosBanco,
          pagoProveedor: { caja: pagoProvCaja, banco: pagoProvBanco },
        },
        gastosOperativos: {
          total: gastosCaja + gastosBanco,
          caja: gastosCaja,
          banco: gastosBanco,
        },
      },
      transferencias: {
        depositoCierre: {
          montoBanco: depositoCierreBanco,
          montoCaja: depositoCierreCaja,
          cantidad: depCount,
          porCuenta,
        },
        bancoACaja,
        validaciones: {
          cajaDisponibleAntesDeDepositar: cajaDisponible,
          excesoDeposito,
        },
      },
      comparativos: {
        netoCajaOperativo,
        efectivoVentas,
        variacionCajaVsVentasEfectivo: variacionVsEfectivo,

        ingresosCajaPorVentas,
        ingresosCajaPorVentasEstimado,
        deltaVentasCajaVsEfectivo,
        ventasOk,

        cajaDisponibleAntesDeDepositar: cajaDisponible,
        depositoCierreCaja,
        excesoDeposito,
        depositoOk,

        alertas,
      },
      diagnostico: {
        snapshotPrevio: {
          caja: N(snapPrev?.saldoFinalCaja) ?? null,
          banco: N(snapPrev?.saldoFinalBanco) ?? null,
        },
        // Para visibilidad: suma de todas las aperturas del día
        aperturaCaja: N(aperturasAgg._sum.saldoInicial ?? 0),
        chequeos: {
          identidadCajaOk,
          identidadBancoOk,
        },
      },
    };
  }

  async getDepositosGroupBy(sucursalId: number, date?: string) {
    try {
      const dateFilter = date
        ? {
            gte: new Date(date + 'T00:00:00Z'),
            lte: new Date(date + 'T23:59:59Z'),
          }
        : undefined;

      const [depositosProveedores, depositosCierres] = await Promise.all([
        this.prisma.movimientoFinanciero.findMany({
          where: {
            motivo: 'DEPOSITO_PROVEEDOR',
            sucursalId,
            ...(dateFilter ? { creadoEn: dateFilter } : {}),
          },
          select: {
            id: true,
            metodoPago: true,
            creadoEn: true,
            deltaBanco: true,
            deltaCaja: true,
            descripcion: true,
            usuario: { select: { id: true, nombre: true, correo: true } },
            proveedor: { select: { id: true, nombre: true } },
            registroCaja: {
              select: { id: true, fechaApertura: true, fechaCierre: true },
            },
          },
        }),
        this.prisma.movimientoFinanciero.findMany({
          where: {
            motivo: 'DEPOSITO_CIERRE',
            sucursalId,
            ...(dateFilter ? { creadoEn: dateFilter } : {}),
          },
          select: {
            id: true,
            deltaBanco: true,
            deltaCaja: true,
            creadoEn: true,
            cuentaBancaria: {
              select: { banco: true, alias: true, numero: true },
            },
          },
        }),
      ]);

      const totalDepositosProveedores = depositosProveedores.reduce(
        (acc, deposito) => acc + Math.abs(Number(deposito.deltaCaja ?? 0)),
        0,
      );

      const totalDepositosCierres = depositosCierres.reduce(
        (acc, deposito) => acc + Math.abs(Number(deposito.deltaBanco ?? 0)),
        0,
      );

      return {
        totalDepoistosProveedores: {
          montoTotal: totalDepositosProveedores,
          noRegistros: depositosProveedores.length,
        },
        totalDepositosCierres: {
          montoTotal: totalDepositosCierres,
          noRegistros: depositosCierres.length,
        },
        depositosProveedores,
        depositosCierres,
      };
    } catch (error) {
      this.logger.error('El error es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error al conseguir depositos agrupados',
      );
    }
  }

  /**
   *
   * @param sucursalId ID de la sucursal
   * @returns Todos los datos historicos de los dias pasados en funcion de las fecha dada
   */
  async getGlobalHistorico(sucursalId: number) {
    try {
      const saldosDeDia = await this.prisma.movimientoFinanciero.findMany();
      const [registroCaja, movimientosFinancies] = await Promise.all([
        this.prisma.registroCaja.findMany({}),
        this.prisma.movimientoFinanciero.findMany({}),
      ]);

      return;
    } catch (error) {
      this.logger.error('El error generado es: ', error);

      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal Error:Error inesperado');
    }
  }

  //HISTORICOS POR SUCURSAL Y GLOBAL
  // -------- Público: Histórico por sucursal --------
  async historicoSucursal(params: {
    sucursalId: number;
    from: string;
    to: string;
    tz?: string;
  }) {
    const { sucursalId, from, to, tz = '-06:00' } = params;
    const days = this.buildDayRange(from, to, tz);
    this.logger.debug('La data llegando es: ', sucursalId, from, to);
    // Traemos todos los snapshots del rango para esta sucursal
    const snaps = await this.prisma.sucursalSaldoDiario.findMany({
      where: {
        sucursalId,
        fecha: { gte: days[0].inicio, lt: days[days.length - 1].fin },
      },
      orderBy: { fecha: 'asc' },
      select: {
        id: true,
        fecha: true,
        saldoInicioCaja: true,
        ingresosCaja: true,
        egresosCaja: true,
        saldoFinalCaja: true,
        saldoInicioBanco: true,
        ingresosBanco: true,
        egresosBanco: true,
        saldoFinalBanco: true,
      },
    });

    // Diccionario por 'YYYY-MM-DD'
    const byDay: Record<string, (typeof snaps)[number]> = {};
    for (const s of snaps) {
      const key = s.fecha.toISOString().slice(0, 10);
      byDay[key] = s;
    }

    // Armar cada día (complementos)
    const rows = [];
    for (const d of days) {
      const snap = byDay[d.dayStr] || null;
      const sinSnapshot = !snap;

      // Datos base de caja/banco (0 si no hay snap)
      const baseCaja = {
        inicio: n(snap?.saldoInicioCaja),
        ingresos: n(snap?.ingresosCaja),
        egresos: n(snap?.egresosCaja),
        final: n(snap?.saldoFinalCaja),
      };
      const baseBanco = {
        inicio: n(snap?.saldoInicioBanco),
        ingresos: n(snap?.ingresosBanco),
        egresos: n(snap?.egresosBanco),
        final: n(snap?.saldoFinalBanco),
      };

      // Complementos del día (ventas, egresos, depósitos cierre)
      const [
        ventasAgg,
        pagosGroup,
        costosCaja,
        costosBanco,
        gastosCaja,
        gastosBanco,
        depSumBanco,
        depCount,
        depSumCajaAbs,
      ] = await Promise.all([
        this.prisma.venta.aggregate({
          where: { sucursalId, fechaVenta: { gte: d.inicio, lt: d.fin } },
          _sum: { totalVenta: true },
          _count: { _all: true },
        }),
        this.prisma.pago.groupBy({
          by: ['metodoPago'],
          where: {
            venta: {
              is: { sucursalId, fechaVenta: { gte: d.inicio, lt: d.fin } },
            },
          },
          _sum: { monto: true },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            clasificacion: 'COSTO_VENTA',
            deltaCaja: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            clasificacion: 'COSTO_VENTA',
            deltaBanco: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            clasificacion: 'GASTO_OPERATIVO',
            deltaCaja: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            clasificacion: 'GASTO_OPERATIVO',
            deltaBanco: { lt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            motivo: 'DEPOSITO_CIERRE',
            deltaBanco: { gt: 0 },
          },
        }),
        this.prisma.movimientoFinanciero.count({
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            motivo: 'DEPOSITO_CIERRE',
          },
        }),
        this.prisma.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: d.inicio, lt: d.fin },
            motivo: 'DEPOSITO_CIERRE',
            deltaCaja: { lt: 0 },
          },
        }),
      ]);

      const ventasTotal = n(ventasAgg._sum.totalVenta);
      const ventasCantidad = n(ventasAgg._count._all);
      const porMetodo: Record<string, number> = {};
      for (const g of pagosGroup)
        porMetodo[g.metodoPago as string] = n(g._sum.monto);

      const efectivoVentas = this.efectivoDesdeMetodos(porMetodo);

      const costosVenta =
        Math.abs(n(costosCaja._sum.deltaCaja)) +
        Math.abs(n(costosBanco._sum.deltaBanco));
      const gastosOperativos =
        Math.abs(n(gastosCaja._sum.deltaCaja)) +
        Math.abs(n(gastosBanco._sum.deltaBanco));
      const depositosCajaABanco = n(depSumBanco._sum.deltaBanco);
      const egresoCajaPorCierre = Math.abs(n(depSumCajaAbs._sum.deltaCaja));

      // Comparativo rápido (misma lógica que en resumen diario)
      const netoCajaOperativo =
        baseCaja.ingresos - (baseCaja.egresos - egresoCajaPorCierre);
      const variacion = netoCajaOperativo - efectivoVentas;
      const descuadre = Math.abs(variacion) > this.UMBRAL_DESCUADRE;

      rows.push({
        fecha: d.dayStr,
        snapshotId: snap?.id ?? null,
        caja: baseCaja,
        banco: baseBanco,
        ventas: {
          total: ventasTotal,
          cantidad: ventasCantidad,
          efectivo: efectivoVentas,
          porMetodo,
        },
        egresos: { costosVenta, gastosOperativos, depositosCajaABanco },
        depositos: { totalMonto: depositosCajaABanco, totalCantidad: depCount },
        flags: { sinSnapshot, descuadreCajaVsEfectivo: descuadre },
        warnings: sinSnapshot ? ['Sin snapshot de cierre para este día'] : [],
      });
    }

    // Period summary
    const sum = rows.reduce(
      (acc, r) => {
        acc.caja.inicio += r.caja.inicio;
        acc.caja.ingresos += r.caja.ingresos;
        acc.caja.egresos += r.caja.egresos;
        acc.caja.final += r.caja.final;

        acc.banco.inicio += r.banco.inicio;
        acc.banco.ingresos += r.banco.ingresos;
        acc.banco.egresos += r.banco.egresos;
        acc.banco.final += r.banco.final;

        acc.ventas.total += r.ventas.total;
        acc.ventas.cantidad += r.ventas.cantidad;
        acc.ventas.efectivo += r.ventas.efectivo;

        acc.egresos.costosVenta += r.egresos.costosVenta;
        acc.egresos.gastosOperativos += r.egresos.gastosOperativos;
        acc.egresos.depositosCajaABanco += r.egresos.depositosCajaABanco;

        acc.depositos.totalMonto += r.depositos.totalMonto;
        acc.depositos.totalCantidad += r.depositos.totalCantidad;

        if (r.flags.sinSnapshot) acc.alerts.add('Faltan snapshots en el rango');
        if (r.flags.descuadreCajaVsEfectivo)
          acc.alerts.add('Descuadres caja vs efectivo en el rango');
        return acc;
      },
      {
        caja: { inicio: 0, ingresos: 0, egresos: 0, final: 0 },
        banco: { inicio: 0, ingresos: 0, egresos: 0, final: 0 },
        ventas: { total: 0, cantidad: 0, efectivo: 0 },
        egresos: {
          costosVenta: 0,
          gastosOperativos: 0,
          depositosCajaABanco: 0,
        },
        depositos: { totalMonto: 0, totalCantidad: 0 },
        alerts: new Set<string>(),
      },
    );

    const periodSummary = {
      caja: sum.caja,
      banco: sum.banco,
      ventas: sum.ventas,
      egresos: sum.egresos,
      depositos: sum.depositos,
      alerts: Array.from(sum.alerts),
    };

    return {
      rango: { from, to, tz },
      sucursalId,
      days: rows,
      periodSummary,
    };
  }

  // -------- Público: Histórico global --------
  async historicoSaldos(params: HistoricoParams) {
    // 1) NUNCA default a "-06:00" aquí; usa IANA seguro
    const { from, to, tz = 'America/Guatemala', sucursalId } = params;

    const spec = parseTz(tz);
    const days = buildDayRange(from, to, spec);

    const rangeInicio = days[0].inicio;
    const rangeFin = days[days.length - 1].fin; // fin del último día (inclusive)

    // 2) Snapshots (GLOBAL vs SUCURSAL) usando lte para incluir el final del día
    const snaps =
      sucursalId != null
        ? await this.prisma.sucursalSaldoDiario.findMany({
            where: { sucursalId, fecha: { gte: rangeInicio, lte: rangeFin } },
            orderBy: { fecha: 'asc' },
            select: {
              id: true,
              fecha: true,
              ingresosCaja: true,
              egresosCaja: true,
              saldoFinalCaja: true,
              ingresosBanco: true,
              egresosBanco: true,
              saldoFinalBanco: true,
            },
          })
        : await this.prisma.saldoGlobalDiario.findMany({
            where: { fecha: { gte: rangeInicio, lte: rangeFin } },
            orderBy: { fecha: 'asc' },
            select: {
              id: true,
              fecha: true,
              ingresosTotalCaja: true,
              egresosTotalCaja: true,
              saldoTotalCaja: true,
              ingresosTotalBanco: true,
              egresosTotalBanco: true,
              saldoTotalBanco: true,
            },
          });

    // 3) Indexar por día, usando SIEMPRE la zona/offset (no UTC crudo)
    const byDay: Record<string, any> = Object.create(null);
    for (const s of snaps) {
      byDay[dayKey(s.fecha, spec)] = s;
    }

    // 4) Ventas del período (cards y por día) — NUNCA .tz(tz) si tz es offset; usa dayKey
    const ventasRows = await this.prisma.venta.findMany({
      where: {
        ...(sucursalId != null ? { sucursalId } : {}),
        fechaVenta: { gte: rangeInicio, lte: rangeFin },
      },
      select: { totalVenta: true, fechaVenta: true },
    });

    const ventasByDay: Record<string, { total: number; count: number }> = {};
    let ventasPeriodoTotal = 0;
    let ventasPeriodoCount = 0;

    for (const v of ventasRows) {
      const d = dayKey(v.fechaVenta, spec);
      if (!ventasByDay[d]) ventasByDay[d] = { total: 0, count: 0 };
      ventasByDay[d].total += N(v.totalVenta);
      ventasByDay[d].count += 1;
      ventasPeriodoTotal += N(v.totalVenta);
      ventasPeriodoCount += 1;
    }

    // 5) Depósitos del período (cards y por día)
    const depRows = await this.prisma.movimientoFinanciero.findMany({
      where: {
        ...(sucursalId != null ? { sucursalId } : {}),
        fecha: { gte: rangeInicio, lte: rangeFin },
        motivo: MotivoMovimiento.DEPOSITO_CIERRE,
        deltaBanco: { gt: 0 },
      },
      select: { fecha: true, deltaBanco: true },
    });

    const depByDay: Record<string, { monto: number; cant: number }> = {};
    let depPeriodoMonto = 0;
    let depPeriodoCant = 0;

    for (const m of depRows) {
      const d = dayKey(m.fecha, spec);
      if (!depByDay[d]) depByDay[d] = { monto: 0, cant: 0 };
      depByDay[d].monto += N(m.deltaBanco);
      depByDay[d].cant += 1;
      depPeriodoMonto += N(m.deltaBanco);
      depPeriodoCant += 1;
    }

    // 6) Armar filas por día (inicio, ingresos, egresos, final) + ventas/depósitos
    const rows = days.map((d) => {
      const key = d.dayStr;
      const s = byDay[key] || null;
      const sinSnapshot = !s;

      // normaliza GLOBAL vs SUCURSAL
      const ingresosCaja = s ? N(s.ingresosCaja ?? s.ingresosTotalCaja) : 0;
      const egresosCaja = s ? N(s.egresosCaja ?? s.egresosTotalCaja) : 0;
      const finalCaja = s ? N(s.saldoFinalCaja ?? s.saldoTotalCaja) : 0;

      const ingresosBanco = s ? N(s.ingresosBanco ?? s.ingresosTotalBanco) : 0;
      const egresosBanco = s ? N(s.egresosBanco ?? s.egresosTotalBanco) : 0;
      const finalBanco = s ? N(s.saldoFinalBanco ?? s.saldoTotalBanco) : 0;

      // inicio = final - ingresos + egresos
      const inicioCaja = finalCaja - ingresosCaja + egresosCaja;
      const inicioBanco = finalBanco - ingresosBanco + egresosBanco;

      const ventasDia = ventasByDay[key] ?? { total: 0, count: 0 };
      const depDia = depByDay[key] ?? { monto: 0, cant: 0 };

      return {
        fecha: key,
        snapshotId: s?.id ?? null,
        caja: {
          inicio: inicioCaja,
          ingresos: ingresosCaja,
          egresos: egresosCaja,
          final: finalCaja,
        },
        banco: {
          inicio: inicioBanco,
          ingresos: ingresosBanco,
          egresos: egresosBanco,
          final: finalBanco,
        },
        ventas: { total: ventasDia.total, cantidad: ventasDia.count },
        depositos: { monto: depDia.monto, cantidad: depDia.cant }, // <- nombre alineado a tu interfaz
        flags: { sinSnapshot },
      };
    });

    // 7) Resumen del período
    const periodSummary = rows.reduce(
      (acc, r) => {
        acc.caja.ingresos += r.caja.ingresos;
        acc.caja.egresos += r.caja.egresos;
        acc.banco.ingresos += r.banco.ingresos;
        acc.banco.egresos += r.banco.egresos;
        return acc;
      },
      {
        caja: { ingresos: 0, egresos: 0, final: rows.at(-1)?.caja.final ?? 0 },
        banco: {
          ingresos: 0,
          egresos: 0,
          final: rows.at(-1)?.banco.final ?? 0,
        },
      } as {
        caja: { ingresos: number; egresos: number; final: number };
        banco: { ingresos: number; egresos: number; final: number };
      },
    );

    const periodEnd = {
      cajaFinal: rows.at(-1)?.caja.final ?? 0,
      bancoFinal: rows.at(-1)?.banco.final ?? 0,
    };

    // 8) Ranking por sucursal (solo en GLOBAL)
    let topSucursales: Array<{
      sucursalId: number;
      cajaFinal: number;
      bancoFinal: number;
    }> = [];
    if (sucursalId == null) {
      const topRaw = await this.prisma.sucursalSaldoDiario.groupBy({
        by: ['sucursalId'],
        where: { fecha: { gte: rangeInicio, lte: rangeFin } },
        _sum: { saldoFinalCaja: true, saldoFinalBanco: true },
        orderBy: { _sum: { saldoFinalBanco: 'desc' } },
        take: 10,
      });
      topSucursales = topRaw.map((r) => ({
        sucursalId: r.sucursalId,
        cajaFinal: N(r._sum.saldoFinalCaja),
        bancoFinal: N(r._sum.saldoFinalBanco),
      }));
    }

    return {
      scope: sucursalId != null ? 'SUCURSAL' : 'GLOBAL',
      filtro: { from, to, tz, sucursalId: sucursalId ?? null },
      days: rows,
      periodSummary: {
        caja: periodSummary.caja,
        banco: periodSummary.banco,
        ventas: { total: ventasPeriodoTotal, cantidad: ventasPeriodoCount },
        depositos: { monto: depPeriodoMonto, cantidad: depPeriodoCant },
      },
      periodEnd,
      topSucursales,
    };
  }
}
