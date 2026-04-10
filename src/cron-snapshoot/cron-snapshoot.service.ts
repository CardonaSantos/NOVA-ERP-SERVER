import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { dayBounds, n } from './helpers';
import { dayjs } from 'src/utils/dayjs';
import { TZGT } from 'src/utils/utils';

@Injectable()
export class CronSnapshootService {
  private readonly logger = new Logger(CronSnapshootService.name);
  constructor(private readonly prisma: PrismaService) {}
  private readonly TZ = '-06:00'; // Guatemala

  // @Cron(CronExpression.EVERY_11_HOURS)
  async CronCreateCierreSucursalDia() {
    // this.cronCierreAyer();
    // const snapshotDia = await this.generarSnapshotSucursalDia(1, '2025-08-22'); // sucursal 1, hoy
    // const snapshootGloabal = await this.generarSnapshotGlobalDia('2025-08-22');
    // this.logger.log('Snapshoot del dia es: ', snapshotDia);
    // this.logger.log('snapshootGloabal del dia es: ', snapshootGloabal);
  }

  /**
   * Cron: cierra "ayer" para TODAS las sucursales y genera el global del día.
   * Idempotente: si ya existe snapshot, se actualiza.
   */
  async cronCierreAyer() {
    const hoy = new Date();
    hoy.setDate(hoy.getDate() - 1);
    const dateISO = hoy.toISOString().slice(0, 10); // YYYY-MM-DD

    this.logger.log(`⏰ Cron cierre para fecha ${dateISO}`);

    const sucursales = await this.prisma.sucursal.findMany({
      select: { id: true },
    });

    // Cerrar por sucursal en paralelo controlado
    await Promise.all(
      sucursales.map((s) =>
        this.generarSnapshotSucursalDia(s.id, dateISO, this.TZ),
      ),
    );

    // Global del día
    const globalSaldo = await this.generarSnapshotGlobalDia(dateISO, this.TZ);
    this.logger.log('Global generado: ', globalSaldo);

    this.logger.log(`✅ Cron cierre completado para ${dateISO}`);
    return { ok: true, dateISO, sucursales: sucursales.length };
  }

  /**
   * Genera o actualiza el snapshot del día para una sucursal (idempotente).
   * - fecha normalizada a 00:00:00 -06:00 (GT)
   * - calcula saldos de inicio desde snapshot previo + delta movimientos hasta el inicio
   * - suma ingresos/egresos del día y cierra saldos finales
   */
  async generarSnapshotSucursalDia(
    sucursalId: number,
    dateISO: string,
    tz = '-06:00',
  ) {
    const { inicio, fin } = dayBounds(dateISO, tz);

    return this.prisma.$transaction(async (tx) => {
      // 1) Snapshot previo (el último antes del día)
      const prev = await tx.sucursalSaldoDiario.findFirst({
        where: { sucursalId, fecha: { lt: inicio } },
        orderBy: { fecha: 'desc' },
        select: { saldoFinalCaja: true, saldoFinalBanco: true },
      });

      // 2) Fallback de apertura si NO hay snapshot previo (primer día)
      const apertura = await tx.registroCaja.findFirst({
        where: { sucursalId, fechaApertura: { gte: inicio, lt: fin } },
        orderBy: { fechaApertura: 'asc' },
        select: { saldoInicial: true },
      });

      // 3) Saldos de inicio (NO sumar "deltaPrev" al snapshot previo)
      const saldoInicioCaja = prev
        ? n(prev.saldoFinalCaja)
        : n(apertura?.saldoInicial); // si tampoco hay apertura, será 0
      const saldoInicioBanco = prev ? n(prev.saldoFinalBanco) : 0; // o capital inicial banco si lo manejas

      // 4) Movimientos del día
      const [cajaIn, cajaOut, banIn, banOut] = await Promise.all([
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: inicio, lt: fin },
            deltaCaja: { gt: 0 },
          },
        }),
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaCaja: true },
          where: {
            sucursalId,
            fecha: { gte: inicio, lt: fin },
            deltaCaja: { lt: 0 },
          },
        }),
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: inicio, lt: fin },
            deltaBanco: { gt: 0 },
          },
        }),
        tx.movimientoFinanciero.aggregate({
          _sum: { deltaBanco: true },
          where: {
            sucursalId,
            fecha: { gte: inicio, lt: fin },
            deltaBanco: { lt: 0 },
          },
        }),
      ]);

      const ingresosCaja = n(cajaIn._sum.deltaCaja);
      const egresosCaja = Math.abs(n(cajaOut._sum.deltaCaja));
      const ingresosBanco = n(banIn._sum.deltaBanco);
      const egresosBanco = Math.abs(n(banOut._sum.deltaBanco));

      const saldoFinalCaja = saldoInicioCaja + ingresosCaja - egresosCaja;
      const saldoFinalBanco = saldoInicioBanco + ingresosBanco - egresosBanco;

      // 5) Upsert idempotente
      const snap = await tx.sucursalSaldoDiario.upsert({
        where: { sucursalId_fecha: { sucursalId, fecha: inicio } },
        update: {
          saldoInicioCaja,
          ingresosCaja,
          egresosCaja,
          saldoFinalCaja,
          saldoInicioBanco,
          ingresosBanco,
          egresosBanco,
          saldoFinalBanco,
        },
        create: {
          sucursalId,
          fecha: inicio,
          saldoInicioCaja,
          ingresosCaja,
          egresosCaja,
          saldoFinalCaja,
          saldoInicioBanco,
          ingresosBanco,
          egresosBanco,
          saldoFinalBanco,
        },
      });

      // (Opcional) logging de diagnóstico
      // this.logger.log({ inicio, sucursalId, saldoInicioCaja, ingresosCaja, egresosCaja, saldoFinalCaja });

      return snap;
    });
  }

  /**
   * Genera o actualiza el snapshot global del día sumando todos los snapshots de sucursal.
   * Además enlaza cada SucursalSaldoDiario.globalDiarioId al global creado/actualizado.
   */
  async generarSnapshotGlobalDia(dateISO: string, tz = '-06:00') {
    const { inicio } = dayBounds(dateISO, tz);

    return this.prisma.$transaction(async (tx) => {
      // 1) Obtener todos los snapshots de sucursales del día
      const snaps = await tx.sucursalSaldoDiario.findMany({
        where: { fecha: inicio },
        select: {
          id: true,
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

      // 2) Sumar
      const sum = snaps.reduce(
        (acc, s) => {
          acc.saldoTotalCaja += n(s.saldoFinalCaja); // puedes guardar finales o también inicios+movs
          acc.ingresosTotalCaja += n(s.ingresosCaja);
          acc.egresosTotalCaja += n(s.egresosCaja);

          acc.saldoTotalBanco += n(s.saldoFinalBanco);
          acc.ingresosTotalBanco += n(s.ingresosBanco);
          acc.egresosTotalBanco += n(s.egresosBanco);
          return acc;
        },
        {
          saldoTotalCaja: 0,
          ingresosTotalCaja: 0,
          egresosTotalCaja: 0,
          saldoTotalBanco: 0,
          ingresosTotalBanco: 0,
          egresosTotalBanco: 0,
        },
      );

      // 3) Upsert en SaldoGlobalDiario
      const global = await tx.saldoGlobalDiario.upsert({
        where: { fecha: inicio },
        update: {
          saldoTotalCaja: sum.saldoTotalCaja,
          ingresosTotalCaja: sum.ingresosTotalCaja,
          egresosTotalCaja: sum.egresosTotalCaja,
          saldoTotalBanco: sum.saldoTotalBanco,
          ingresosTotalBanco: sum.ingresosTotalBanco,
          egresosTotalBanco: sum.egresosTotalBanco,
        },
        create: {
          fecha: inicio,
          saldoTotalCaja: sum.saldoTotalCaja,
          ingresosTotalCaja: sum.ingresosTotalCaja,
          egresosTotalCaja: sum.egresosTotalCaja,
          saldoTotalBanco: sum.saldoTotalBanco,
          ingresosTotalBanco: sum.ingresosTotalBanco,
          egresosTotalBanco: sum.egresosTotalBanco,
        },
      });

      // 4) Enlazar cada snapshot al global (opcional pero recomendable)
      if (snaps.length) {
        await tx.sucursalSaldoDiario.updateMany({
          where: { fecha: inicio },
          data: { globalDiarioId: global.id },
        });
      }

      return global;
    });
  }

  async deleteAllSnapshoots() {
    const x = await this.prisma.sucursalSaldoDiario.deleteMany({});
    const y = await this.prisma.saldoGlobalDiario.deleteMany({});

    return {
      x,
      y,
    };
  }

  async getAllRegistros() {
    const [x, y] = await Promise.all([
      this.prisma.sucursalSaldoDiario.findMany({}),
      this.prisma.saldoGlobalDiario.findMany({}),
    ]);

    return { x, y };
  }

  //==================================>

  /**
   * Siembra/actualiza el snapshot de AYER (startOfDay en TZGT) para una sucursal.
   * - saldoInicioCaja/Banco se toma del ÚLTIMO snapshot < ayer (o 0 si no hay).
   * - saldoFinalCaja/Banco se toma del DTO (o 0).
   * - ingresos/egresos se calculan como la diferencia entre inicio y final (simple para testing).
   * - Recalcula también el GLOBAL del día y linkea los snapshots de sucursal.
   */
  async seedYesterday(dto: {
    sucursalId: number;
    saldoFinalCaja?: number;
    saldoFinalBanco?: number;
    usuarioId?: number;
  }) {
    if (!dto?.sucursalId) {
      throw new BadRequestException('sucursalId es requerido');
    }

    return this.prisma.$transaction(async (tx) => {
      const fecha = dayjs().tz(TZGT).subtract(1, 'day').startOf('day').toDate();

      // Buscar el snapshot inmediatamente anterior a "ayer" (para saldoInicio*)
      const previo = await tx.sucursalSaldoDiario.findFirst({
        where: { sucursalId: dto.sucursalId, fecha: { lt: fecha } },
        orderBy: { fecha: 'desc' },
        select: { saldoFinalCaja: true, saldoFinalBanco: true },
      });

      const saldoInicioCaja = Number(previo?.saldoFinalCaja ?? 0);
      const saldoInicioBanco = Number(previo?.saldoFinalBanco ?? 0);

      const saldoFinalCaja = Number(dto.saldoFinalCaja ?? 0);
      const saldoFinalBanco = Number(dto.saldoFinalBanco ?? 0);

      // Para test: modelamos ingresos/egresos como la diferencia simple
      const ingresosCaja = Math.max(0, saldoFinalCaja - saldoInicioCaja);
      const egresosCaja = Math.max(0, saldoInicioCaja - saldoFinalCaja);

      const ingresosBanco = Math.max(0, saldoFinalBanco - saldoInicioBanco);
      const egresosBanco = Math.max(0, saldoInicioBanco - saldoFinalBanco);

      // Upsert del snapshot por sucursal
      const sucSnap = await tx.sucursalSaldoDiario.upsert({
        // 👇 OJO: este nombre de clave compuesta suele ser <Modelo>_<campos>_key.
        // Si Prisma generó un nombre distinto, ajusta aquí.
        where: { sucursalId_fecha: { sucursalId: dto.sucursalId, fecha } },
        update: {
          saldoInicioCaja,
          ingresosCaja,
          egresosCaja,
          saldoFinalCaja,
          saldoInicioBanco,
          ingresosBanco,
          egresosBanco,
          saldoFinalBanco,
        },
        create: {
          sucursalId: dto.sucursalId,
          fecha,
          saldoInicioCaja,
          ingresosCaja,
          egresosCaja,
          saldoFinalCaja,
          saldoInicioBanco,
          ingresosBanco,
          egresosBanco,
          saldoFinalBanco,
        },
      });

      // Recalcular GLOBAL del día (sumatoria de todas las sucursales para esa fecha)
      const rows = await tx.sucursalSaldoDiario.findMany({
        where: { fecha },
        select: {
          saldoFinalCaja: true,
          ingresosCaja: true,
          egresosCaja: true,
          saldoFinalBanco: true,
          ingresosBanco: true,
          egresosBanco: true,
        },
      });

      const sums = rows.reduce(
        (acc, r) => {
          acc.saldoTotalCaja += Number(r.saldoFinalCaja ?? 0);
          acc.ingresosTotalCaja += Number(r.ingresosCaja ?? 0);
          acc.egresosTotalCaja += Number(r.egresosCaja ?? 0);
          acc.saldoTotalBanco += Number(r.saldoFinalBanco ?? 0);
          acc.ingresosTotalBanco += Number(r.ingresosBanco ?? 0);
          acc.egresosTotalBanco += Number(r.egresosBanco ?? 0);
          return acc;
        },
        {
          saldoTotalCaja: 0,
          ingresosTotalCaja: 0,
          egresosTotalCaja: 0,
          saldoTotalBanco: 0,
          ingresosTotalBanco: 0,
          egresosTotalBanco: 0,
        },
      );

      const global = await tx.saldoGlobalDiario.upsert({
        where: { fecha },
        update: { ...sums, usuarioId: dto.usuarioId ?? undefined },
        create: { fecha, ...sums, usuarioId: dto.usuarioId ?? undefined },
      });

      // (Opcional) Linkear snapshots de sucursal con el global del día
      await tx.sucursalSaldoDiario.updateMany({
        where: { fecha },
        data: { globalDiarioId: global.id },
      });

      return {
        ok: true,
        fecha, // ISO del inicio de AYER en TZGT
        sucursalId: dto.sucursalId,
        snapshot: {
          saldoInicioCaja,
          saldoFinalCaja,
          saldoInicioBanco,
          saldoFinalBanco,
        },
      };
    });
  }

  /**
   * INSERTAR DATOS FICTICIONS DE SNAPSHOOTS PARA PRUEBAS
   * @param dto
   * @returns
   */
  async seedLastWeek(dto: { sucursalId: number; usuarioId?: number }) {
    const { sucursalId, usuarioId } = dto;
    if (!sucursalId) {
      throw new BadRequestException('sucursalId es requerido');
    }

    return this.prisma.$transaction(async (tx) => {
      const today = dayjs().tz(TZGT).startOf('day');

      const resultados: any[] = [];

      let saldoCajaPrevio = 0;
      let saldoBancoPrevio = 0;

      // Correr 7 días hacia atrás (20 → 26 si hoy es 27)
      for (let i = 7; i >= 1; i--) {
        const fecha = today.subtract(i, 'day').toDate();

        // Generar valores ficticios (puedes cambiarlos a tu gusto)
        const saldoFinalCaja =
          saldoCajaPrevio + Math.round(Math.random() * 500 - 200); // +- variación
        const saldoFinalBanco =
          saldoBancoPrevio + Math.round(Math.random() * 1000 - 300);

        const ingresosCaja = Math.max(0, saldoFinalCaja - saldoCajaPrevio);
        const egresosCaja = Math.max(0, saldoCajaPrevio - saldoFinalCaja);

        const ingresosBanco = Math.max(0, saldoFinalBanco - saldoBancoPrevio);
        const egresosBanco = Math.max(0, saldoBancoPrevio - saldoFinalBanco);

        // Upsert snapshot sucursal
        const sucSnap = await tx.sucursalSaldoDiario.upsert({
          where: { sucursalId_fecha: { sucursalId, fecha } },
          update: {
            saldoInicioCaja: saldoCajaPrevio,
            ingresosCaja,
            egresosCaja,
            saldoFinalCaja,
            saldoInicioBanco: saldoBancoPrevio,
            ingresosBanco,
            egresosBanco,
            saldoFinalBanco,
          },
          create: {
            sucursalId,
            fecha,
            saldoInicioCaja: saldoCajaPrevio,
            ingresosCaja,
            egresosCaja,
            saldoFinalCaja,
            saldoInicioBanco: saldoBancoPrevio,
            ingresosBanco,
            egresosBanco,
            saldoFinalBanco,
          },
        });

        // Recalcular global del día
        const rows = await tx.sucursalSaldoDiario.findMany({
          where: { fecha },
        });
        const sums = rows.reduce(
          (acc, r) => {
            acc.saldoTotalCaja += Number(r.saldoFinalCaja ?? 0);
            acc.ingresosTotalCaja += Number(r.ingresosCaja ?? 0);
            acc.egresosTotalCaja += Number(r.egresosCaja ?? 0);
            acc.saldoTotalBanco += Number(r.saldoFinalBanco ?? 0);
            acc.ingresosTotalBanco += Number(r.ingresosBanco ?? 0);
            acc.egresosTotalBanco += Number(r.egresosBanco ?? 0);
            return acc;
          },
          {
            saldoTotalCaja: 0,
            ingresosTotalCaja: 0,
            egresosTotalCaja: 0,
            saldoTotalBanco: 0,
            ingresosTotalBanco: 0,
            egresosTotalBanco: 0,
          },
        );

        const global = await tx.saldoGlobalDiario.upsert({
          where: { fecha },
          update: { ...sums, usuarioId: usuarioId ?? undefined },
          create: { fecha, ...sums, usuarioId: usuarioId ?? undefined },
        });

        // Linkear snapshots de sucursal al global
        await tx.sucursalSaldoDiario.updateMany({
          where: { fecha },
          data: { globalDiarioId: global.id },
        });

        resultados.push({ fecha, sucSnap, global });

        // Preparar saldos para el siguiente día
        saldoCajaPrevio = saldoFinalCaja;
        saldoBancoPrevio = saldoFinalBanco;
      }

      return { ok: true, resultados };
    });
  }
}
