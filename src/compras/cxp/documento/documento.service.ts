import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateDocumentoDto, PlanCuotaFila } from './dto/create-documento.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { dayjs } from 'src/utils/dayjs';

import { TZGT } from 'src/utils/utils';
import { Prisma } from '@prisma/client';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';
import { CreateMFUtility } from 'src/movimiento-financiero/utilities/createMFDto';
import { CreditFromCompraTypes, selectCreditoFromCompra } from './selects';
import {
  normalizarCreditoFromCompra,
  UICreditoCompra,
} from './helpers/normalizer';

/**
 * NOTAS DE DISEÑO
 * - Esta versión asume que el FRONT envía el array de cuotas definitivo (ordenado y editable por el usuario).
 * - Si hay enganche (PRIMERA_MAYOR) y se marca "registrarPagoEngancheAhora", se paga la CUOTA #1 en la misma transacción.
 * - No se crean cuotas "extra" por el enganche: la #1 del plan ES el enganche.
 * - Se recalculan saldoPendiente, interesTotal y estado del documento después de crear cuotas y, si aplica, del pago inicial.
 */

function isNil(v: any) {
  return v === null || v === undefined;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class DocumentoService {
  private readonly logger = new Logger(DocumentoService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoFinanciero: MovimientoFinancieroService,
  ) {}

  /** Valida presencia de props no-nulas */
  private requiereProps(obj: Record<string, any>, requerido: string[]) {
    const faltantes = requerido.filter((k) => isNil(obj[k]));
    if (faltantes.length) {
      throw new BadRequestException(
        `Faltan los campos: ${faltantes.join(', ')}`,
      );
    }
  }

  /**
   *
   * @param compraId ID de compra
   * @returns Registro de credito compra con cuotas, pagos, etc. Unico, retorno obj.
   */
  async getCreditoFromCompra(compraId: number): Promise<UICreditoCompra> {
    try {
      this.logger.log('El id de documento es: ', compraId);
      if (!Number.isFinite(compraId) || compraId <= 0) {
        // throw new BadRequestException('ID de compra no válido');
        this.logger.log(
          'El id proporcionado no corresponde con ningún registro de compra con credito',
        );
        return;
      }

      const credit: CreditFromCompraTypes | null =
        await this.prisma.cxPDocumento.findFirst({
          where: { compraId },
          take: 1,
          select: selectCreditoFromCompra,
        });

      if (!credit) {
        this.logger.error('Compra o crédito no encontrado');
        return;
      }

      const ui = normalizarCreditoFromCompra(credit);
      return ui;
    } catch (error: any) {
      this.logger.error('Error en getCreditoFromCompra', error?.stack || error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al obtener el crédito.',
      );
    }
  }

  /**
   *
   * @returns eliminar todo los registros - prueba
   */
  async deleteAll() {
    return await this.prisma.cxPDocumento.deleteMany({});
  }

  /**
   *
   * @returns get de pruebas - creditos
   */
  async getRegists() {
    return await this.prisma.cxPDocumento.findMany({
      include: {
        condicionPago: true,
        pagos: true,
        cuotas: true,
      },
    });
  }

  // CREACION DE CREDITO ==================>
  /**
   *
   * @param dto Crear credito funcion Main (y sus derivados)
   */
  async createCreditoRegist(dto: CreateDocumentoDto) {
    try {
      this.logger.log(`DTO recibido:\n${JSON.stringify(dto, null, 2)}`);

      // Suma de cuotas vs montoOriginal
      const sumaCuotas = round2(
        dto.cuotas!.reduce((a, c) => a + Number(c.monto), 0),
      );
      if (
        dto.interesTipo === 'NONE' &&
        Math.abs(sumaCuotas - Number(dto.montoOriginal)) > 0.01
      ) {
        throw new BadRequestException(
          'Con interés NONE, la suma de cuotas debe igualar el montoOriginal.',
        );
      }

      // Si hay enganche, cuota #1 debe coincidir
      if (dto.planCuotaModo === 'PRIMERA_MAYOR' && (dto.enganche ?? 0) > 0) {
        if (
          !dto.cuotas?.length ||
          Math.abs(Number(dto.cuotas[0].monto) - Number(dto.enganche)) > 0.01
        ) {
          throw new BadRequestException(
            'El monto de la cuota #1 debe coincidir con el enganche.',
          );
        }
      }

      // Si registrarPagoEngancheAhora => metodoPago obligatorio

      const today = dayjs().tz(TZGT).format('YYYY');

      this.requiereProps(dto, [
        'usuarioId',
        'compraId',
        'diasCredito',
        'diasEntrePagos',
        'proveedorId',
        'montoOriginal',
      ]);

      if (!Array.isArray(dto.cuotas) || dto.cuotas.length === 0) {
        throw new BadRequestException(
          'Debes enviar el arreglo de cuotas generado por la UI.',
        );
      }

      // Normalizaciones menores
      if (dto.interesTipo === 'NONE') dto.interes = 0;
      if (dto.interes > 1) dto.interes = dto.interes / 100; // admite 2 como 2%.

      // Reglas de enganche vs plan enviado
      if (dto.planCuotaModo === 'PRIMERA_MAYOR' && (dto.enganche ?? 0) <= 0) {
        throw new BadRequestException(
          'Plan PRIMERA_MAYOR requiere un enganche > 0.',
        );
      }
      if (dto.planCuotaModo === 'IGUALES') dto.enganche = 0;

      const result = await this.prisma.$transaction(async (tx) => {
        // 1) Validaciones de integridad de compra/proveedor (mínimas)
        const compra = await tx.compra.findUnique({
          where: { id: dto.compraId },
          select: { id: true, total: true, proveedorId: true },
        });
        if (!compra) throw new BadRequestException('Compra no encontrada.');
        if (compra.proveedorId !== dto.proveedorId) {
          throw new BadRequestException(
            'El proveedor no coincide con la compra.',
          );
        }

        // 2) Monto base y consistencia con cuotas
        const montoBase = Number(dto.montoOriginal ?? compra.total);
        const sumaCuotas = round2(
          dto.cuotas!.reduce((a, c) => a + Number(c.monto), 0),
        );
        const interesTotal = round2(sumaCuotas - montoBase);
        if (montoBase <= 0)
          throw new BadRequestException('montoOriginal debe ser > 0.');

        // si hay enganche, validar que la cuota #1 sea coherente
        if (dto.enganche && dto.cuotas![0]) {
          const diff = Math.abs(
            Number(dto.cuotas![0].monto) - Number(dto.enganche),
          );
          if (diff > 0.01) {
            throw new BadRequestException(
              'El monto de la cuota #1 no coincide con el enganche.',
            );
          }
        }

        // 3) Snapshot de condición de pago (opcional pero útil para auditoría)
        const condicionPago = await tx.condicionPago.create({
          data: {
            nombre: `Condición compra #${dto.compraId}`,
            diasCredito: dto.diasCredito,
            cantidadCuotas: dto.cantidadCuotas,
            diasEntreCuotas: dto.diasEntrePagos,
            interes: dto.interes,
            tipoInteres: dto.interesTipo,
            modoGeneracion: dto.planCuotaModo,
          },
        });

        // 4) Cabecera CxPDocumento
        const doc = await tx.cxPDocumento.create({
          data: {
            proveedorId: dto.proveedorId,
            compraId: dto.compraId,
            folioProveedor: `DOC`,
            fechaEmision: new Date(dto.fechaEmisionISO),
            fechaVencimiento: new Date(
              dto.cuotas![dto.cuotas!.length - 1].fechaISO,
            ), // última cuota
            montoOriginal: montoBase,
            saldoPendiente: 0, // se ajusta después
            interesTotal,
            estado: 'PENDIENTE',
            condicionPagoId: condicionPago.id,
            usuarioId: dto.usuarioId,

            // Si tienes el campo en el schema (migración):
            // usuarioId: dto.usuarioId,
          },
        });

        const folioProv = `DOC-0${doc.id}-${today}`;
        await tx.cxPDocumento.update({
          where: {
            id: doc.id,
          },
          data: {
            folioProveedor: folioProv,
          },
        });

        // 5) Crear cuotas (usa las que vienen de la UI, re-indexadas por seguridad)
        const cuotasCreadas = await this.createCuotasForDocumento(
          tx,
          doc.id,
          dto.cuotas!,
        );

        // 6) Pago inmediato del enganche (opcional)
        if (dto.registrarPagoEngancheAhora && (dto.enganche ?? 0) > 0) {
          await this.pagarEngancheAhoraTx(tx, {
            documentoId: doc.id,
            proveedorId: dto.proveedorId,
            usuarioId: dto.usuarioId,
            sucursalId: dto.sucursalId,
            cuentaBancariaId: dto.cuentaBancariaId,
            metodoPago: dto.metodoPago,
            descripcion: dto.descripcion,
            monto: Number(dto.enganche),
          });
        }

        // 7) Recalcular saldo del documento + estado
        await this.actualizarSaldosDocumentoTx(tx, doc.id, montoBase);

        // 8) Devolver documento con cuotas/pagos
        return tx.cxPDocumento.findUnique({
          where: { id: doc.id },
          include: {
            cuotas: true,
            pagos: true,
            condicionPago: true,
          },
        });
      });

      return result;
    } catch (error) {
      this.logger.error('Error al crear crédito de compra', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al crear el crédito.',
      );
    }
  }

  /** Crea todas las cuotas del documento basándose en el array proveniente del front. */
  private async createCuotasForDocumento(
    tx: Prisma.TransactionClient,
    documentoId: number,
    cuotasUI: PlanCuotaFila[],
  ) {
    // Re-indexar números por seguridad y respetar fechas/montos enviados
    const tasks = cuotasUI.map((c, idx) =>
      tx.cxPCuota.create({
        data: {
          documentoId,
          numero: idx + 1,
          fechaVencimiento: new Date(c.fechaISO),
          monto: Number(c.monto),
          saldo: Number(c.monto),
          estado: 'PENDIENTE',
        },
      }),
    );
    return Promise.all(tasks);
  }

  /** Paga la cuota #1 (enganche) creando Movimiento, Pago y Pago↔Cuota. */
  private async pagarEngancheAhoraTx(
    tx: Prisma.TransactionClient,
    args: {
      documentoId: number;
      proveedorId: number;
      usuarioId: number;
      sucursalId: number;
      cuentaBancariaId?: number;
      metodoPago: any; // tu enum MetodoPago
      descripcion?: string;
      monto: number; // <- enganche a pagar (lo que mandó el front)
    },
  ) {
    // 0) Validaciones básicas
    const monto = round2(Number(args.monto ?? 0));
    if (!(monto > 0)) {
      throw new BadRequestException('El monto de enganche es inválido.');
    }

    const doc = await tx.cxPDocumento.findUnique({
      where: { id: args.documentoId },
      select: { id: true, montoOriginal: true },
    });
    if (!doc) {
      throw new BadRequestException('Documento de CxP no encontrado.');
    }

    const cuotas = await tx.cxPCuota.findMany({
      where: {
        documentoId: args.documentoId,
        estado: { in: ['PENDIENTE', 'PARCIAL'] },
      },
      orderBy: { numero: 'asc' },
    });
    if (!cuotas.length) {
      throw new BadRequestException(
        'No hay cuotas pendientes para aplicar el enganche.',
      );
    }

    const mov = await this.movimientoFinanciero.createMovimiento(
      {
        sucursalId: args.sucursalId,
        usuarioId: args.usuarioId,
        proveedorId: args.proveedorId,
        cuentaBancariaId: args.cuentaBancariaId,
        monto,
        motivo: 'PAGO_CREDITO', // ajusta a tu enum si es distinto
        metodoPago: args.metodoPago,
        descripcion:
          args.descripcion ??
          'Pago de enganche (aplicación a cuotas en cascada)',
      } as CreateMFUtility,
      { tx },
    );

    const pago = await tx.cxPPago.create({
      data: {
        fechaPago: new Date(),
        monto,
        metodoPago: args.metodoPago,
        referencia: `ENG-${args.documentoId}-${dayjs().tz(TZGT).format('YYYYMMDDHHmmss')}`,
        observaciones: args.descripcion ?? 'Pago de enganche',
        movimientoFinanciero: { connect: { id: mov.id } },
        documento: { connect: { id: args.documentoId } },
        registradoPor: { connect: { id: args.usuarioId } },
      },
    });

    let restante = monto;

    for (const c of cuotas) {
      if (restante <= 0) break;

      const saldo = round2(Number(c.saldo));
      if (saldo <= 0) continue;

      const abono = Math.min(restante, saldo);

      await tx.cxPPagoCuota.create({
        data: { pagoId: pago.id, cuotaId: c.id, monto: abono },
      });

      const nuevoSaldo = round2(saldo - abono);
      await tx.cxPCuota.update({
        where: { id: c.id },
        data: {
          saldo: nuevoSaldo,
          estado: nuevoSaldo <= 0 ? 'PAGADA' : 'PARCIAL',
          pagadaEn: nuevoSaldo <= 0 ? new Date() : null,
        },
      });

      restante = round2(restante - abono);
    }

    if (restante > 0.009) {
      this.logger.warn(
        `Pago de enganche con excedente Q${restante} en doc ${args.documentoId}.`,
      );
    }

    // 5) Recalcular documento (saldo/estado/interésTotal)
    // Tu versión de actualizarSaldosDocumentoTx requiere montoOriginal; lo leemos del doc.
    await this.actualizarSaldosDocumentoTx(
      tx,
      args.documentoId,
      Number(doc.montoOriginal),
    );
  }

  /** Recalcula saldo y estado del documento tras crear cuotas y/o aplicar pagos. */
  private async actualizarSaldosDocumentoTx(
    tx: Prisma.TransactionClient,
    documentoId: number,
    montoOriginal: number,
  ) {
    const cuotas = await tx.cxPCuota.findMany({ where: { documentoId } });
    const saldoDoc = round2(cuotas.reduce((a, c) => a + Number(c.saldo), 0));
    const totalCuotas = round2(cuotas.reduce((a, c) => a + Number(c.monto), 0));
    const interesTotal = round2(totalCuotas - Number(montoOriginal));

    await tx.cxPDocumento.update({
      where: { id: documentoId },
      data: {
        saldoPendiente: saldoDoc,
        interesTotal,
        estado:
          saldoDoc <= 0
            ? 'PAGADO'
            : saldoDoc < totalCuotas
              ? 'PARCIAL'
              : 'PENDIENTE',
      },
    });
  }
}
