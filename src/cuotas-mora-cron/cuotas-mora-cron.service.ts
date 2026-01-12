import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as dayjs from 'dayjs';
import 'dayjs/locale/es';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import * as customParseFormat from 'dayjs/plugin/customParseFormat';
import { PrismaService } from 'src/prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { NotiSeverity } from '@prisma/client';
import { SelectCreditosActivos } from './select/selectCredito';
import { TZGT } from 'src/utils/utils';
import { NotificationService } from 'src/notification/notification.service';
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.locale('es');

@Injectable()
export class CuotasMoraCronService {
  private readonly logger = new Logger(CuotasMoraCronService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly noti: NotificationService,
  ) {}

  @Cron('10 0 * * *', {
    name: 'creditos.mora.daily',
    timeZone: TZGT,
  })
  async accrueMoraAndRemindOnceDaily() {
    try {
      const creditos = await this.prisma.ventaCuota.findMany({
        where: { estado: { in: ['ACTIVA', 'EN_MORA'] as any } },
        select: SelectCreditosActivos,
      });

      this.logger.log(
        'Los creditos activos de ventas con cuotas son: ',
        creditos,
      );

      for (const credito of creditos) {
        await this.processCredito(credito);
      }
    } catch (error) {
      this.logger.error('Cron mora (daily) falló', error?.stack);
      throw new InternalServerErrorException('Cron mora: error inesperado');
    }
  }

  private async processCredito(credito: any) {
    const today = dayjs().tz(TZGT).startOf('day');

    const interes = Number(credito.interes ?? 0);
    const hasInterest = interes > 0;
    const tasaDiaria = hasInterest ? interes / 100 / 365 : 0;

    for (const c of credito.cuotas) {
      const esperado = Number(c.montoEsperado ?? c.monto ?? 0);
      const pagado = Number(c.montoPagado ?? 0);

      if (pagado >= esperado) continue;
      if (['PAGADA', 'CERRADA', 'CANCELADA'].includes(c.estado)) continue;

      const venc = dayjs(c.fechaVencimiento).tz(TZGT).startOf('day');

      if (!today.isAfter(venc)) continue;

      if (c.fechaUltimoCalculoMora) {
        const lastCalc = dayjs(c.fechaUltimoCalculoMora)
          .tz(TZGT)
          .startOf('day');
        if (lastCalc.isSame(today, 'day')) continue;
      }

      const lastCalcOrVenc = c.fechaUltimoCalculoMora
        ? dayjs(c.fechaUltimoCalculoMora).tz(TZGT).startOf('day')
        : venc;

      const from = lastCalcOrVenc.isAfter(venc) ? lastCalcOrVenc : venc;
      const dias = Math.max(0, today.diff(from, 'day'));

      if (dias === 0) continue;

      const saldoCapital = Math.max(0, esperado - pagado);
      if (saldoCapital <= 0) continue;

      if (!hasInterest) {
        await this.markAtrasadaYNotificar(credito, c, today, false, 0);
        continue;
      }

      const moraDeltaRaw = saldoCapital * tasaDiaria * dias;
      const moraDelta = Math.round(moraDeltaRaw * 10000) / 10000;

      if (moraDelta > 0) {
        await this.applyMoraDelta(credito, c, today, moraDelta, dias);
      }
    }
  }

  private async markAtrasadaYNotificar(
    credito: any,
    cuota: any,
    today: dayjs.Dayjs,
    withMora: boolean,
    moraDelta: number,
  ) {
    // No tocar estados finales
    if (['PAGADA', 'CERRADA', 'CANCELADA'].includes(cuota.estado)) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.ventaCuota.update({
        where: { id: credito.id },
        data: { estado: 'EN_MORA' },
      });

      if (cuota.estado !== 'ATRASADA') {
        await tx.cuota.update({
          where: { id: cuota.id },
          data: {
            estado: 'ATRASADA',
            fechaUltimoCalculoMora: today.toDate(),
          },
        });
      }

      if (withMora || cuota.estado !== 'ATRASADA') {
        await tx.ventaCuotaHistorial.create({
          data: {
            ventaCuotaId: credito.id,
            accion: withMora ? 'MORA_REGISTRADA' : 'CAMBIO_ESTADO',
            comentario: withMora
              ? `Mora registrada: +Q${moraDelta.toFixed(2)}`
              : `Cuota #${cuota.numero} vencida`,
          },
        });
      }
    });

    await this.notify(
      credito,
      cuota,
      withMora ? 'ALERTA' : 'INFORMACION',
      withMora,
      moraDelta,
      today,
    );
  }

  private async applyMoraDelta(
    credito: any,
    cuota: any,
    today: dayjs.Dayjs,
    moraDeltaInput: number,
    dias: number,
  ) {
    if (['PAGADA', 'CERRADA', 'CANCELADA'].includes(cuota.estado)) return;

    const moraDelta = Math.round(Number(moraDeltaInput) * 10000) / 10000;
    if (moraDelta <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.cuota.findUnique({
        where: { id: cuota.id },
        select: {
          id: true,
          numero: true,
          monto: true,
          montoEsperado: true,
          montoPagado: true,
          moraAcumulada: true,
        },
      });
      if (!before) return;

      const esperado = Number(before.montoEsperado ?? before.monto ?? 0);
      const pagado = Number(before.montoPagado ?? 0);
      if (pagado >= esperado) return;

      await tx.ventaCuota.update({
        where: { id: credito.id },
        data: { estado: 'EN_MORA' },
      });

      const after = await tx.cuota.update({
        where: { id: before.id },
        data: {
          moraAcumulada: { increment: moraDelta },
          estado: 'ATRASADA',
          fechaUltimoCalculoMora: today.toDate(),
        },
      });

      await tx.ventaCuotaHistorial.create({
        data: {
          ventaCuotaId: credito.id,
          accion: 'MORA_REGISTRADA',
          comentario: `Cuota #${after.numero}: +Q${moraDelta.toFixed(4)} por ${dias} día(s).`,
        },
      });
    });

    await this.notify(credito, cuota, 'ALERTA', true, moraDelta, today);
  }

  private async notify(
    credito: any,
    cuota: any,
    severidad: NotiSeverity | 'ALERTA' | 'INFORMACION',
    withMora: boolean,
    moraDelta: number,
    today: dayjs.Dayjs,
  ) {
    if (['PAGADA', 'CERRADA', 'CANCELADA'].includes(cuota.estado)) return;
    if (withMora && moraDelta <= 0) return;

    const userId = credito?.responsableCobroId;
    if (!userId) return;

    await this.noti.createOne({
      userId,
      categoria: 'CREDITO',
      severidad: withMora ? 'ALERTA' : 'INFORMACION',
      titulo: withMora ? 'Mora registrada en cuota' : 'Cuota vencida',
      mensaje: withMora
        ? `Cuota #${cuota.numero} ha acumulado Q${moraDelta.toFixed(2)} de mora.`
        : `Cuota #${cuota.numero} vencida.`,
      meta: {
        creditoId: credito.id,
        cuotaId: cuota.id,
        fecha: today.format('YYYY-MM-DD'),
      } as any,
      referenciaTipo: 'Cuota',
      referenciaId: cuota.id,
      sucursalId: credito.sucursalId ?? null,
    });
  }
}
