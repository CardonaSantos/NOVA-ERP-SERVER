// src/abono-cuota/abono-cuota.service.ts
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, EstadoPago, EstadoCuota, AccionCredito } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAbonoCuotaDto } from './dto/create-abono-cuota.dto';
import { DeleteAbonoCuotaDto } from './dto/delete-cuota';
import { MetasService } from 'src/metas/metas.service';

@Injectable()
export class AbonoCuotaService {
  private readonly logger = new Logger(AbonoCuotaService.name);
  private readonly EPS = 0.005;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaRepo: MetasService,
  ) {}

  // ===== Helpers numéricos y de fechas =====
  private sum(arr: number[] = []) {
    return arr.reduce((a, b) => a + b, 0);
  }
  private daysBetween(a: Date, b: Date) {
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }
  private near(a: number, b: number) {
    return Math.abs(a - b) <= this.EPS;
  }

  // ===== Cálculos de pendientes / mora =====
  private calcMoraPendiente(opts: {
    cuota: {
      fechaVencimiento: Date | null;
      moraAcumulada: number | null;
      abonos: { montoMora: number | null }[];
    };
    credito: { diasGracia: number; moraDiaria: number };
  }) {
    const { cuota, credito } = opts;
    const hoy = new Date();
    const fv = cuota.fechaVencimiento ? new Date(cuota.fechaVencimiento) : null;
    const diasGracia = credito.diasGracia || 0;
    const moraDiaria = Number(credito.moraDiaria || 0);

    let diasAtraso = 0;
    if (fv) {
      const desde = new Date(fv);
      desde.setDate(desde.getDate() + diasGracia);
      diasAtraso = Math.max(0, this.daysBetween(desde, hoy));
    }

    const yaPagadoMora = this.sum(
      (cuota.abonos ?? []).map((a) => a.montoMora || 0),
    );
    const moraAlDia =
      typeof cuota.moraAcumulada === 'number' && cuota.moraAcumulada > 0
        ? Number(cuota.moraAcumulada)
        : diasAtraso * moraDiaria;

    const moraPendiente = Math.max(0, moraAlDia - yaPagadoMora);
    return { diasAtraso, moraAlDia, moraPendiente };
  }

  private calcPendientesConcepto(opts: {
    cuota: {
      monto: number | null;
      montoPagado: number | null;
      montoCapital: number | null;
      montoInteres: number | null;
      abonos: { montoCapital: number | null; montoInteres: number | null }[];
    };
  }) {
    const { cuota } = opts;
    const paidCap = this.sum(
      (cuota.abonos ?? []).map((a) => a.montoCapital || 0),
    );
    const paidInt = this.sum(
      (cuota.abonos ?? []).map((a) => a.montoInteres || 0),
    );

    const progInt = Number(cuota.montoInteres || 0);
    // si no hay desglose capital programado, lo inferimos desde monto total
    const progCap =
      typeof cuota.montoCapital === 'number'
        ? Number(cuota.montoCapital)
        : Math.max(0, Number(cuota.monto || 0) - progInt);

    const capPend = Math.max(0, progCap - paidCap);
    const intPend = Math.max(0, progInt - paidInt);
    return { capitalPendiente: capPend, interesPendiente: intPend };
  }

  // ===== Estado siguiente de cuota =====
  private nextCuotaState(opts: {
    despues: { capPend: number; intPend: number; moraPend: number };
    fv: Date | null;
    diasGracia: number;
  }): EstadoPago {
    const { capPend, intPend, moraPend } = opts.despues;
    if (capPend <= this.EPS && intPend <= this.EPS && moraPend <= this.EPS) {
      return EstadoPago.PAGADA;
    }
    // Atraso si vencida + gracia y aún hay pendientes
    const hoy = new Date();
    if (opts.fv) {
      const desde = new Date(opts.fv);
      desde.setDate(desde.getDate() + (opts.diasGracia || 0));
      if (this.daysBetween(desde, hoy) > 0) return EstadoPago.ATRASADA;
    }
    return EstadoPago.PARCIAL; // si hay algo pagado; el caller puede resolver PENDIENTE si 0 pagado
  }

  // ===== Flags del crédito (proximo pago + estado global) =====
  private async recomputeCreditoFlags(
    tx: Prisma.TransactionClient,
    creditoId: number,
  ) {
    const cuotas = await tx.cuota.findMany({
      where: { ventaCuotaId: creditoId },
      select: { id: true, estado: true, fechaVencimiento: true },
      orderBy: { numero: 'asc' },
    });

    const allPaid = cuotas.every((q) => q.estado === EstadoPago.PAGADA);
    const anyLate = cuotas.some((q) => q.estado === EstadoPago.ATRASADA);

    let fechaProximoPago: Date | null = null;
    const next = cuotas
      .filter((q) => q.estado !== EstadoPago.PAGADA && q.fechaVencimiento)
      .sort(
        (a, b) => a.fechaVencimiento!.getTime() - b.fechaVencimiento!.getTime(),
      )[0];
    if (next) fechaProximoPago = next.fechaVencimiento!;

    const newEstado: EstadoCuota = allPaid
      ? EstadoCuota.COMPLETADA
      : anyLate
        ? EstadoCuota.EN_MORA
        : EstadoCuota.ACTIVA;

    const updated = await tx.ventaCuota.update({
      where: { id: creditoId },
      data: { fechaProximoPago, estado: newEstado },
      select: { id: true, estado: true, fechaProximoPago: true },
    });

    return updated;
  }

  // ===== Registro en historial =====
  private async addHistorial(
    tx: Prisma.TransactionClient,
    creditoId: number,
    usuarioId: number | null,
    accion: AccionCredito,
    comentario?: string,
  ) {
    await tx.ventaCuotaHistorial.create({
      data: {
        ventaCuotaId: creditoId,
        accion,
        comentario: comentario || null,
        usuarioId: usuarioId || null,
        fecha: new Date(),
      },
    });
  }

  // ===== Validación de prioridad mora -> interés -> capital =====
  private validatePriority(
    reqCap: number,
    reqInt: number,
    reqMora: number,
    pend: { cap: number; int: number; mora: number },
  ) {
    // No puedes abonar a capital si queda mora o interés pendiente sin cubrir en este mismo pago
    if (reqCap > this.EPS && pend.mora - reqMora > this.EPS) {
      throw new BadRequestException(
        'Primero debe cubrir la MORA antes del capital.',
      );
    }
    if (reqCap > this.EPS && pend.int - reqInt > this.EPS) {
      throw new BadRequestException(
        'Primero debe cubrir el INTERÉS antes del capital.',
      );
    }
  }

  // ========================================================================
  //                                  CREATE
  // ========================================================================
  async create(dto: CreateAbonoCuotaDto) {
    this.logger.log(
      `DTO recibido en abono cuota:\n${JSON.stringify(dto, null, 2)}`,
    );

    try {
      if (!dto.detalles?.length) {
        throw new BadRequestException('Debe enviar al menos un detalle.');
      }

      // Coherencia global (puedes pagar varias cuotas en un mismo abono)
      const detallesSum = this.sum(
        dto.detalles.map((d) => Number(d.montoTotal || 0)),
      );
      if (!this.near(Number(dto.montoTotal || 0), detallesSum)) {
        throw new BadRequestException(
          'El montoTotal no coincide con la suma de los detalles.',
        );
      }

      // Transacción
      const result = await this.prisma.$transaction(async (tx) => {
        // 1) Crédito base
        const credito = await tx.ventaCuota.findUnique({
          where: { id: dto.ventaCuotaId },
          select: {
            id: true,
            estado: true,
            totalPagado: true,
            montoVenta: true,
            montoTotalConInteres: true,
            diasGracia: true,
            moraDiaria: true,
          },
        });
        if (!credito) throw new NotFoundException('Crédito no encontrado.');
        if (credito.estado === EstadoCuota.CANCELADA) {
          throw new BadRequestException('El crédito está cancelado.');
        }

        // 2) Cabecera del abono
        const abono = await tx.abonoCredito.create({
          data: {
            ventaCuotaId: dto.ventaCuotaId,
            sucursalId: dto.sucursalId,
            usuarioId: dto.usuarioId,
            registroCajaId: dto.registroCajaId ?? null,
            metodoPago: dto.metodoPago,
            referenciaPago: dto.referenciaPago || null,
            fechaAbono: dto.fechaAbono ? new Date(dto.fechaAbono) : new Date(),
            montoTotal: dto.montoTotal,
          },
          select: { id: true },
        });

        let totalAplicado = 0;
        let cambioEstadoCredito = false;
        const comentariosHistorial: string[] = [];

        // 3) Detalles
        for (const d of dto.detalles) {
          const cuota = await tx.cuota.findUnique({
            where: { id: d.cuotaId },
            select: {
              id: true,
              numero: true,
              estado: true,
              fechaVencimiento: true,
              fechaPago: true,
              monto: true,
              montoEsperado: true,
              montoCapital: true,
              montoInteres: true,
              montoPagado: true,
              moraAcumulada: true,
              abonos: {
                select: {
                  montoCapital: true,
                  montoInteres: true,
                  montoMora: true,
                },
              },
            },
          });
          if (!cuota)
            throw new NotFoundException(`Cuota ${d.cuotaId} no encontrada.`);
          if (cuota.estado === EstadoPago.PAGADA) {
            throw new BadRequestException(
              `La cuota #${cuota.numero} ya está pagada.`,
            );
          }

          // Pendientes actuales
          const { capitalPendiente, interesPendiente } =
            this.calcPendientesConcepto({ cuota });
          const { moraPendiente, moraAlDia } = this.calcMoraPendiente({
            cuota,
            credito: {
              diasGracia: credito.diasGracia || 0,
              moraDiaria: Number(credito.moraDiaria || 0),
            },
          });

          // Totales requeridos (pueden venir 0)
          let reqMora = Number(d.montoMora ?? 0);
          let reqInt = Number(d.montoInteres ?? 0);
          let reqCap = Number(d.montoCapital ?? 0);
          const reqTot = Number(d.montoTotal || 0);

          if (reqTot <= this.EPS) {
            throw new BadRequestException(
              'El monto del detalle debe ser mayor a 0.',
            );
          }

          // Autodesglose por prioridad si vino solo el total
          if (reqMora + reqInt + reqCap <= this.EPS && reqTot > this.EPS) {
            let rest = reqTot;
            const aMora = Math.min(moraPendiente, rest);
            rest -= aMora;
            const aInt = Math.min(interesPendiente, rest);
            rest -= aInt;
            const aCap = Math.min(capitalPendiente, rest);
            rest -= aCap;

            reqMora = aMora;
            reqInt = aInt;
            reqCap = aCap;
            (d as any).montoMora = reqMora;
            (d as any).montoInteres = reqInt;
            (d as any).montoCapital = reqCap;
          }

          // Coherencia detalle
          const sumaConceptos = reqMora + reqInt + reqCap;
          if (!this.near(reqTot, sumaConceptos)) {
            throw new BadRequestException(
              `El detalle no cuadra: total (${reqTot.toFixed(2)}) ≠ mora+interés+capital (${sumaConceptos.toFixed(2)}).`,
            );
          }

          // Límites
          if (reqMora > moraPendiente + this.EPS)
            throw new BadRequestException('Mora excede el pendiente.');
          if (reqInt > interesPendiente + this.EPS)
            throw new BadRequestException('Interés excede el pendiente.');
          if (reqCap > capitalPendiente + this.EPS)
            throw new BadRequestException('Capital excede el pendiente.');

          // Prioridad: mora -> interés -> capital
          this.validatePriority(reqCap, reqInt, reqMora, {
            cap: capitalPendiente,
            int: interesPendiente,
            mora: moraPendiente,
          });

          // 3.1) Guardar detalle
          await tx.abonoCuota.create({
            data: {
              abonoId: abono.id,
              cuotaId: cuota.id,
              montoCapital: reqCap,
              montoInteres: reqInt,
              montoMora: reqMora,
              montoTotal: reqTot,
            },
          });

          // 3.2) Actualizar cuota
          const nuevoMontoPagado = Number(cuota.montoPagado || 0) + reqTot;

          // Mora restante (al día) después de pagar mora
          const moraRestante = Math.max(0, moraAlDia - reqMora);
          const despues = {
            capPend: Math.max(0, capitalPendiente - reqCap),
            intPend: Math.max(0, interesPendiente - reqInt),
            moraPend: Math.max(0, moraPendiente - reqMora),
          };
          const newEstadoCuota = this.nextCuotaState({
            despues,
            fv: cuota.fechaVencimiento
              ? new Date(cuota.fechaVencimiento)
              : null,
            diasGracia: credito.diasGracia || 0,
          });

          await tx.cuota.update({
            where: { id: cuota.id },
            data: {
              montoPagado: nuevoMontoPagado,
              moraAcumulada: moraRestante,
              fechaUltimoCalculoMora: new Date(),
              estado: newEstadoCuota,
              fechaPago:
                newEstadoCuota === EstadoPago.PAGADA
                  ? dto.fechaAbono
                    ? new Date(dto.fechaAbono)
                    : new Date()
                  : cuota.fechaPago,
            },
          });

          totalAplicado += reqTot;
          comentariosHistorial.push(
            `Cuota #${cuota.numero}: mora=${reqMora.toFixed(2)}, interés=${reqInt.toFixed(2)}, capital=${reqCap.toFixed(2)}`,
          );
        }

        // 4) totalPagado del crédito
        await tx.ventaCuota.update({
          where: { id: credito.id },
          data: {
            totalPagado: Number(credito.totalPagado || 0) + totalAplicado,
          },
        });

        // 5) Flags globales del crédito
        const flags = await this.recomputeCreditoFlags(tx, credito.id);
        cambioEstadoCredito = flags.estado !== credito.estado;

        // 6) Historial
        await this.addHistorial(
          tx,
          credito.id,
          dto.usuarioId,
          AccionCredito.ABONO,
          comentariosHistorial.join(' | '),
        );
        if (cambioEstadoCredito) {
          await this.addHistorial(
            tx,
            credito.id,
            dto.usuarioId,
            AccionCredito.CAMBIO_ESTADO,
            `Estado del crédito: ${credito.estado} → ${flags.estado}`,
          );
        }

        // 7) (Caja/Banco) — pendiente de integrar si lo deseas
        const movimientoMF = await tx.movimientoFinanciero.create({
          data: {
            sucursal: { connect: { id: dto.sucursalId } },
            referencia: dto.referenciaPago ?? null,
            descripcion: dto.observaciones,
            deltaCaja: dto.montoTotal,
            clasificacion: 'INGRESO',
            motivo: 'COBRO_CREDITO',
            usuario: { connect: { id: dto.usuarioId } },

            ...(dto.registroCajaId
              ? { registroCaja: { connect: { id: dto.registroCajaId } } }
              : {}),

            metodoPago: dto.metodoPago,
          },
        });

        await tx.abonoCredito.update({
          where: { id: abono.id },
          data: {
            movimientoFinanciero: {
              connect: {
                id: movimientoMF.id,
              },
            },
          },
        });

        await this.metaRepo.incrementarMetaTx(
          tx,
          dto.usuarioId,
          dto.montoTotal,
          'tienda',
        );

        this.logger.log(
          `cajaAdicion :\n${JSON.stringify(movimientoMF, null, 2)}`,
        );

        return {
          ok: true,
          abonoId: abono.id,
          totalAplicado,
          credito: {
            id: credito.id,
            estado: flags.estado,
            fechaProximoPago: flags.fechaProximoPago,
          },
        };
      });

      return result;
    } catch (error) {
      this.logger.error('Error en módulo abono cuotas:', error?.stack || error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en módulo abonos',
      );
    }
  }

  // ========================================================================
  //                                  DELETE
  // ========================================================================
  //
  /**
   * Eliminar un abono y revertir sus efectos:
   * - Recalcula montoPagado/mora/estado de la(s) cuota(s) afectadas
   * - Resta el total del abono al crédito y recalcula flags globales
   * - Anula/elimina vínculo de caja si existe
   * - Deja historial
   */
  async delete(dto: DeleteAbonoCuotaDto) {
    this.logger.log(`Eliminar abono:\n${JSON.stringify(dto, null, 2)}`);

    try {
      if (!dto.abonoId || !dto.ventaCuotaId || !dto.usuarioId) {
        throw new BadRequestException('Parámetros incompletos.');
      }

      const result = await this.prisma.$transaction(async (tx) => {
        // 1) Cargar abono + crédito
        const abono = await tx.abonoCredito.findUnique({
          where: { id: dto.abonoId },
          select: {
            id: true,
            ventaCuotaId: true,
            sucursalId: true,
            usuarioId: true,
            fechaAbono: true,
            montoTotal: true,
            registroCajaId: true,
            movimientoFinancieroId: true,
            detalles: {
              select: {
                cuotaId: true,
                montoCapital: true,
                montoInteres: true,
                montoMora: true,
                montoTotal: true,
              },
            },
          },
        });
        if (!abono) throw new NotFoundException('Abono no encontrado.');
        if (abono.ventaCuotaId !== dto.ventaCuotaId) {
          throw new BadRequestException(
            'El abono no pertenece al crédito indicado.',
          );
        }

        const credito = await tx.ventaCuota.findUnique({
          where: { id: abono.ventaCuotaId },
          select: {
            id: true,
            estado: true,
            totalPagado: true,
            diasGracia: true,
            moraDiaria: true,
          },
        });
        if (!credito) throw new NotFoundException('Crédito no encontrado.');

        // 2) Revertir efectos en cada cuota afectada
        for (const det of abono.detalles) {
          // Forzamos recomputar contra el estado actual de los abonos (aún incluye este abono)
          const cuota = await tx.cuota.findUnique({
            where: { id: det.cuotaId },
            select: {
              id: true,
              numero: true,
              fechaVencimiento: true,
              fechaPago: true,
              monto: true,
              montoEsperado: true,
              montoCapital: true,
              montoInteres: true,
              montoPagado: true,
              moraAcumulada: true,
              ventaCuotaId: true,
              abonos: {
                select: {
                  montoTotal: true,
                  montoMora: true,
                  montoInteres: true,
                  montoCapital: true,
                  abonoId: true,
                },
              },
            },
          });
          if (!cuota)
            throw new NotFoundException(`Cuota ${det.cuotaId} no encontrada.`);

          // 2.1) Nuevo montoPagado = sum(abonos sin el que vamos a borrar)
          const sumOtrosAbonosTotal = (cuota.abonos || [])
            .filter((a) => a.abonoId !== abono.id)
            .reduce((s, a) => s + Number(a.montoTotal || 0), 0);

          // 2.2) Borramos primero los detalles (para que los recálculos posteriores no lo vean)
          await tx.abonoCuota.deleteMany({
            where: { abonoId: abono.id, cuotaId: cuota.id },
          });

          // 2.3) Recalcular mora/estado con helpers (en base a abonos restantes)
          await this.recalcCuotaAfterChange(tx, {
            cuotaId: cuota.id,
            nuevoMontoPagado: sumOtrosAbonosTotal,
            creditoCtx: {
              diasGracia: credito.diasGracia || 0,
              moraDiaria: Number(credito.moraDiaria || 0),
            },
          });
        }

        // 3) Actualizar totalPagado del crédito (restar el abono)
        const nuevoTotalPagado = Math.max(
          0,
          Number(credito.totalPagado || 0) - Number(abono.montoTotal || 0),
        );
        await tx.ventaCuota.update({
          where: { id: credito.id },
          data: { totalPagado: nuevoTotalPagado },
        });

        // 4) Eliminar cabecera del abono (cascada elimina AbonoCuota restantes, por si alguno)
        await tx.abonoCredito.delete({ where: { id: abono.id } });

        // 5) (Opcional) Anular movimiento de caja/banco
        if (abono.registroCajaId) {
          // Ajusta según tu schema de caja:
          // - si tienes "anulado" / "activo" / "comentario" / "motivoAnulacion"
          await tx.registroCaja
            .update({
              where: { id: abono.registroCajaId },
              data: {
                // anulado: true,
                // comentario: `Anulado por eliminación de abono #${abono.id}. ${dto.motivo ?? ''}`.trim(),
              },
            })
            .catch(() => {
              // No hacemos fail de toda la transacción por un posible esquema distinto.
              this.logger.warn(
                `No se pudo actualizar registroCaja #${abono.registroCajaId}; revisa el schema.`,
              );
            });
        }

        // 6) Recalcular flags globales del crédito
        const prevEstado = credito.estado;
        const flags = await this.recomputeCreditoFlags(tx, credito.id);

        // 7) Historial
        const comentarioBase =
          `Abono #${abono.id} eliminado por usuario #${dto.usuarioId}.` +
          (dto.motivo ? ` Motivo: ${dto.motivo}` : '');
        await this.addHistorial(
          tx,
          credito.id,
          dto.usuarioId,
          AccionCredito.AJUSTE_MANUAL,
          comentarioBase,
        );

        if (abono.movimientoFinancieroId) {
          await tx.movimientoFinanciero.delete({
            where: { id: abono.movimientoFinancieroId },
          });
        }

        if (flags.estado !== prevEstado) {
          await this.addHistorial(
            tx,
            credito.id,
            dto.usuarioId,
            AccionCredito.CAMBIO_ESTADO,
            `Estado del crédito: ${prevEstado} → ${flags.estado}`,
          );
        }

        return {
          ok: true,
          abonoId: abono.id,
          credito: {
            id: credito.id,
            estado: flags.estado,
            fechaProximoPago: flags.fechaProximoPago,
          },
        };
      });

      return result;
    } catch (error) {
      this.logger.error('Error eliminando abono:', error?.stack || error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado eliminando abono.',
      );
    }
  }

  // ===== Helpers (reusa los tuyos y este local) =====
  /** Recalcula una cuota tras cambios en sus abonos (montoPagado/mora/estado/fechaPago) */
  private async recalcCuotaAfterChange(
    tx: Prisma.TransactionClient,
    params: {
      cuotaId: number;
      nuevoMontoPagado: number;
      creditoCtx: { diasGracia: number; moraDiaria: number };
    },
  ) {
    const q = await tx.cuota.findUnique({
      where: { id: params.cuotaId },
      select: {
        id: true,
        numero: true,
        fechaVencimiento: true,
        fechaPago: true,
        monto: true,
        montoEsperado: true,
        montoCapital: true,
        montoInteres: true,
        montoPagado: true,
        moraAcumulada: true,
        abonos: {
          select: {
            montoTotal: true,
            montoMora: true,
            montoInteres: true,
            montoCapital: true,
          },
        },
      },
    });
    if (!q)
      throw new NotFoundException(
        `Cuota ${params.cuotaId} no encontrada al recalcular.`,
      );

    const sumMoraPagada = this.sum(q.abonos.map((a) => a.montoMora));
    const sumTotalAbonos = this.sum(q.abonos.map((a) => a.montoTotal));
    const montoPagado = Math.max(params.nuevoMontoPagado, sumTotalAbonos); // por seguridad

    // Recalcular pendientes (reusa tus helpers)
    const { capitalPendiente, interesPendiente } = this.calcPendientesConcepto({
      cuota: { ...q, montoPagado } as any,
    });
    const { moraPendiente, moraAlDia } = this.calcMoraPendiente({
      cuota: { ...q, montoPagado } as any,
      credito: params.creditoCtx,
    });

    const moraRestante = Math.max(0, moraAlDia - sumMoraPagada);
    const despues = {
      capPend: capitalPendiente,
      intPend: interesPendiente,
      moraPend: moraRestante,
    };

    const newEstado = this.nextCuotaState({
      despues,
      fv: q.fechaVencimiento ? new Date(q.fechaVencimiento) : null,
      diasGracia: params.creditoCtx.diasGracia || 0,
    });

    await tx.cuota.update({
      where: { id: q.id },
      data: {
        montoPagado,
        moraAcumulada: moraRestante,
        fechaUltimoCalculoMora: new Date(),
        estado: newEstado,
        // si ya no está pagada, limpiamos fechaPago
        fechaPago: newEstado === EstadoPago.PAGADA ? q.fechaPago : null,
      },
    });
  }
}
