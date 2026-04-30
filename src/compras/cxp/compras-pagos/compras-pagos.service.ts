import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { dayjs } from 'src/utils/dayjs';

import { TZGT } from 'src/utils/utils';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';
import { Prisma } from '@prisma/client';
import { DeletePagoCuota } from './dto/delete-pago-cuota';
import { verifyProps } from 'src/utils/verifyPropsFromDTO';
import {
  CreateComprasPagoConRecepcionDto,
  CreateRecepcionItemDto,
} from './dto/create-compras-pago.dto';
import { ProrrateoService } from 'src/prorrateo/prorrateo.service';

@Injectable()
export class ComprasPagosService {
  private readonly logger = new Logger(ComprasPagosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mf: MovimientoFinancieroService,
    private readonly prorrateo: ProrrateoService,
  ) {}

  /**
   * Crea y mata el registro de pago de una cuota
   * @param dto Datos basicos para pagar y decidir que deltas usar para caja o banco
   * @returns Registro de pago a una cuota
   */
  async create(dto: CreateComprasPagoConRecepcionDto) {
    this.logger.log(
      `DTO recibido en pago cuota credito compra:\n${JSON.stringify(dto, null, 2)}`,
    );

    try {
      // Requeridos mínimos (fechaPago es opcional en tu DTO)
      verifyProps(dto, [
        'documentoId',
        'sucursalId',
        'cuotaId',
        'registradoPorId',
        'metodoPago',
        'monto',
      ]);

      const {
        documentoId,
        sucursalId,
        cuotaId,
        registradoPorId,
        metodoPago,
        monto,
        fechaPago,
        observaciones,
        referencia,
        expectedCuotaSaldo,
        comprobanteTipo,
        comprobanteNumero,
        comprobanteFecha,
        comprobanteUrl,
        //NUEVO
        recepcion,
      } = dto;

      // Normalizar/validar monto como Decimal(14,2)
      const { Prisma } = await import('@prisma/client');
      const montoDec = new Prisma.Decimal(monto);
      if (montoDec.lte(0)) {
        throw new BadRequestException('El monto debe ser mayor a 0.');
      }

      // Normalizar método por si UI envía "CONTADO" algún día
      const metodo = (String(metodoPago) as any).toUpperCase();
      const metodoNorm: typeof metodoPago =
        metodo === 'CONTADO' ? ('EFECTIVO' as any) : metodoPago;

      // Fecha de pago (si no viene, usar now() GT)
      const fechaPagoDate = fechaPago
        ? new Date(fechaPago)
        : dayjs().tz(TZGT).toDate();

      // Transacción fuerte
      const result = await this.prisma.$transaction(
        async (tx) => {
          // 1) Documento (y proveedor para MF)
          const doc = await tx.cxPDocumento.findUnique({
            where: { id: documentoId },
            select: {
              id: true,
              proveedorId: true,
              estado: true,
            },
          });
          if (!doc) throw new BadRequestException('Documento no encontrado.');
          if (doc.estado === 'ANULADO') {
            throw new BadRequestException(
              'No se puede pagar un documento ANULADO.',
            );
          }

          // 2) Lock de la cuota y lectura consistente
          await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
          await tx.$queryRaw`
          SELECT id FROM "CxPCuota"
          WHERE id = ${cuotaId}
          FOR UPDATE NOWAIT
        `;

          const cuota = await tx.cxPCuota.findUnique({
            where: { id: cuotaId },
            select: {
              id: true,
              documentoId: true,
              estado: true,
              saldo: true,
              monto: true,
            },
          });
          if (!cuota) throw new BadRequestException('Cuota no encontrada.');
          if (cuota.documentoId !== documentoId) {
            throw new BadRequestException(
              'La cuota no pertenece al documento.',
            );
          }
          if (cuota.estado === 'PAGADA') {
            throw new BadRequestException('La cuota ya está PAGADA.');
          }

          // 3) Concurrencia optimista (opcional)
          if (expectedCuotaSaldo != null) {
            const expected = new Prisma.Decimal(expectedCuotaSaldo);
            if (!expected.eq(cuota.saldo)) {
              throw new BadRequestException(
                `El saldo de la cuota cambió. Esperado ${expected.toFixed(
                  2,
                )}, actual ${new Prisma.Decimal(cuota.saldo).toFixed(2)}.`,
              );
            }
          }

          // 4) Validar capacidad de pago
          const saldoActual = new Prisma.Decimal(
            cuota.saldo ?? cuota.monto ?? 0,
          );
          if (montoDec.gt(saldoActual)) {
            throw new BadRequestException(
              `Monto (${montoDec.toFixed(
                2,
              )}) excede el saldo de la cuota (${saldoActual.toFixed(2)}).`,
            );
          }

          // 5) Crear MovimientoFinanciero (server decide Caja/Banco)
          // Por ahora, política conservadora:
          // - EFECTIVO => CAJA (DEPOSITO_PROVEEDOR)
          // - Otros métodos => TODO BANCO (requiere cuentaBancariaId en DTO)
          let movimiento: { id: number } | null = null;

          if (metodoNorm === ('EFECTIVO' as any)) {
            movimiento = await this.mf.createMovimiento(
              {
                sucursalId,
                usuarioId: registradoPorId,
                proveedorId: doc.proveedorId ?? undefined,
                motivo: 'DEPOSITO_PROVEEDOR', // egreso de caja al proveedor
                metodoPago: 'EFECTIVO',
                monto: Number(montoDec.toString()), // tu util usa number
                descripcion: observaciones ?? undefined,
                referencia: referencia ?? undefined,
                esDepositoProveedor: true,
                // registroCajaId: opcional; tu util lo resuelve si falta
              },
              { tx }, // MUY IMPORTANTE: dentro de la misma transacción
            );
          } else {
            // TODO: BANCO — cuando agregues cuentaBancariaId al DTO, habilita:
            movimiento = await this.mf.createMovimiento(
              {
                sucursalId,
                usuarioId: registradoPorId,
                proveedorId: doc.proveedorId ?? undefined,
                motivo: 'PAGO_PROVEEDOR_BANCO',
                metodoPago: metodoNorm as any,
                monto: Number(montoDec.toString()),
                descripcion: observaciones ?? undefined,
                referencia: referencia ?? undefined,
                cuentaBancariaId: dto.cuentaBancariaId, // <-- futuro
                // Puedes mapear comprobante* aquí si tu util los soporta
              },
              { tx },
            );
          }

          // 6) Crear CxPPago
          const pago = await tx.cxPPago.create({
            data: {
              documentoId,
              registradoPorId,
              metodoPago: metodoNorm,
              monto: montoDec, // Prisma soporta string|Decimal
              fechaPago: fechaPagoDate,
              referencia: referencia ?? null,
              observaciones: observaciones ?? null,
              movimientoFinancieroId: movimiento?.id ?? null, // enlace 1–1
            },
            select: {
              id: true,
              documentoId: true,
              metodoPago: true,
              monto: true,
              fechaPago: true,
              referencia: true,
              observaciones: true,
              movimientoFinancieroId: true,
            },
          });

          // 7) Crear distribución CxPPagoCuota (una sola cuota)
          await tx.cxPPagoCuota.create({
            data: {
              pagoId: pago.id,
              cuotaId: cuota.id,
              monto: montoDec,
            },
          });

          // 8) Actualizar cuota (saldo, estado, pagadaEn)
          const nuevoSaldo = saldoActual.minus(montoDec).toDecimalPlaces(2);
          const estadoCuota = nuevoSaldo.lte(0)
            ? ('PAGADA' as const)
            : ('PARCIAL' as const);

          const cuotaActualizada = await tx.cxPCuota.update({
            where: { id: cuota.id },
            data: {
              saldo: nuevoSaldo,
              estado: estadoCuota,
              pagadaEn: estadoCuota === 'PAGADA' ? fechaPagoDate : null,
            },
            select: {
              id: true,
              estado: true,
              saldo: true,
              pagadaEn: true,
            },
          });

          // 9) Recalcular saldoPendiente del documento y estado
          const agg = await tx.cxPCuota.aggregate({
            where: { documentoId },
            _sum: { saldo: true },
          });
          const saldoDoc = new Prisma.Decimal(
            agg._sum.saldo ?? 0,
          ).toDecimalPlaces(2);
          const estadoDoc = saldoDoc.eq(0)
            ? ('PAGADO' as const)
            : ('PARCIAL' as const);

          const docActualizado = await tx.cxPDocumento.update({
            where: { id: documentoId },
            data: {
              saldoPendiente: saldoDoc,
              estado: estadoDoc,
              // Si quieres updatedAt automático ya lo maneja @updatedAt
            },
            select: {
              id: true,
              estado: true,
              saldoPendiente: true,
            },
          });

          // 10) (Opcional) persistir comprobante en algún lado si tu esquema lo soporta
          // - Por ahora, lo dejamos como metadata en movimiento/pago vía `referencia` y `observaciones`.
          // - Si más adelante añades tabla de comprobantes, se inserta aquí.
          this.logger.log('Llamando al registro de create stock credito ');
          const recv = await this.creatStockFromCompraCreditoParcial(tx, dto);

          // Si hay costo asociado y se pidió prorratear, lo hacemos ahora
          if (
            recv &&
            dto.recepcion?.prorrateo?.aplicar &&
            dto.recepcion?.mf?.monto! > 0
          ) {
            // 1) Movimiento financiero del costo asociado (separado del pago de la cuota)
            const mfCosto = await this.mf.createMovimiento(
              {
                sucursalId: dto.recepcion.mf!.sucursalId,
                usuarioId: registradoPorId,
                proveedorId:
                  (
                    await tx.cxPDocumento.findUnique({
                      where: { id: documentoId },
                      select: { proveedorId: true },
                    })
                  )?.proveedorId ?? undefined,
                motivo: 'COSTO_ASOCIADO',
                // clasificacionAdmin: 'COSTO_VENTA',
                metodoPago: dto.recepcion.mf!.metodoPago as any,
                costoVentaTipo: dto.recepcion.mf!.costoVentaTipo as any,
                monto: dto.recepcion.mf!.monto,
                descripcion:
                  dto.recepcion.mf!.descripcion ??
                  `Costo asociado compra #${dto.recepcion.compraId} – Recepción #${recv.recepcionId}`,
                cuentaBancariaId: dto.recepcion.mf!.cuentaBancariaId,
                registroCajaId: dto.recepcion.mf!.registroCajaId,
              },
              { tx },
            );

            // 2) PRORRATEO — prioriza Modo A y pasa ids como fallback Modo B
            await this.prorrateo.generarProrrateoUnidadesTx(tx, {
              sucursalId: dto.sucursalId,
              compraId: dto.recepcion.compraId,
              compraRecepcionId: recv.recepcionId, // 👈 Modo A
              gastosAsociadosCompra: dto.recepcion.mf!.monto,
              movimientoFinancieroId: mfCosto.id, // idempotencia
              comentario: `Prorrateo UNIDADES – Compra #${dto.recepcion.compraId} – Recepción #${recv.recepcionId}`,
              newStockIds: recv.newStockIds, // 👈 fallback Modo B
              newStocksPresIds: recv.newStocksPresIds, // 👈 fallback Modo B
              // Si más adelante honras base/incluirAntiguos:
              // base: dto.recepcion.prorrateo?.base,
              // incluirAntiguos: dto.recepcion.prorrateo?.incluirAntiguos ?? false,
            });
          }

          return {
            pago,
            cuotaActualizada,
            documentoActualizado: docActualizado,
            movimiento: movimiento ? { id: movimiento.id } : null,
          };
        },
        { isolationLevel: 'Serializable' },
      );

      return result;
    } catch (error) {
      this.logger.error('Error en modulo de pagos credito compras', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en modulo pago de creditos compras',
      );
    }
  }

  /**
   * Revierte el último pago asociado a una cuota de un documento.
   * - Borra CxPPagoCuota (la distribución de ese pago a la cuota)
   * - Si el pago no está distribuido a otras cuotas, borra CxPPago y su MF
   * - Restaura saldo/estado de la cuota y estado del documento
   */
  async deletePagoCuota(dto: DeletePagoCuota) {
    this.logger.log(
      `DTO recibido (deletePagoCuota):\n${JSON.stringify(dto, null, 2)}`,
    );

    try {
      verifyProps<DeletePagoCuota>(dto, [
        'cuotaId',
        'documentoId',
        'usuarioId',
      ]);

      const { cuotaId, documentoId } = dto;
      const { Prisma } = await import('@prisma/client');

      return await this.prisma.$transaction(
        async (tx) => {
          // 1) Documento
          const doc = await tx.cxPDocumento.findUnique({
            where: { id: documentoId },
            select: { id: true, estado: true, montoOriginal: true },
          });
          if (!doc) throw new BadRequestException('Documento ID no válido');
          if (doc.estado === 'ANULADO') {
            throw new BadRequestException(
              'No se puede modificar un documento ANULADO.',
            );
          }

          // 2) Lock cuota para evitar condiciones de carrera
          await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
          await tx.$queryRaw`SELECT id FROM "CxPCuota" WHERE id = ${cuotaId} FOR UPDATE NOWAIT`;

          const cuota = await tx.cxPCuota.findUnique({
            where: { id: cuotaId },
            select: {
              id: true,
              documentoId: true,
              estado: true,
              saldo: true,
              monto: true,
            },
          });
          if (!cuota) throw new BadRequestException('Cuota ID no válido');
          if (cuota.documentoId !== documentoId) {
            throw new BadRequestException(
              'La cuota no pertenece al documento.',
            );
          }

          // 3) Buscar el ÚLTIMO pago aplicado a esta cuota (por fecha/id desc)
          const cuotaPago = await tx.cxPPagoCuota.findFirst({
            where: { cuotaId },
            orderBy: [
              { pago: { fechaPago: 'desc' } as any }, // TS hack para anidado
              { pagoId: 'desc' },
            ],
            include: {
              pago: {
                select: {
                  id: true,
                  movimientoFinancieroId: true,
                  monto: true,
                  compraRecepcionId: true, // por si decides tratar recepciones
                },
              },
            },
          });

          if (!cuotaPago) {
            throw new BadRequestException(
              'La cuota no tiene pagos para revertir.',
            );
          }

          // 4) Verificar si el pago se distribuyó a otras cuotas
          const countDistribucion = await tx.cxPPagoCuota.count({
            where: { pagoId: cuotaPago.pagoId },
          });

          // Política conservadora: si el pago está distribuido a varias cuotas,
          // no lo tocamos con este endpoint simple.
          if (countDistribucion > 1) {
            throw new BadRequestException(
              'El pago está distribuido entre varias cuotas. ' +
                'Usa un endpoint específico con pagoId para revertir parcialmente.',
            );
          }

          // 5) Eliminar la distribución cuota<->pago
          await tx.cxPPagoCuota.delete({
            where: {
              pagoId_cuotaId: {
                pagoId: cuotaPago.pagoId,
                cuotaId: cuotaId,
              },
            },
          });

          // 6) Si existe MF, elimínalo primero (para que el FK de CxPPago quede en null por onDelete:SetNull)
          if (cuotaPago.pago.movimientoFinancieroId) {
            // Si tienes un método de dominio:
            // if (this.mf?.deleteMovimiento) {
            //   await this.mf.deleteMovimiento(cuotaPago.pago.movimientoFinancieroId, { tx });
            // } else {
            // Fallback: borrar directo (mantén onDelete:SetNull en CxPPago.movimientoFinancieroId)
            await tx.movimientoFinanciero.delete({
              where: { id: cuotaPago.pago.movimientoFinancieroId },
            });
            // }
          }

          // 7) Borrar el CxPPago (ya no apunta a ninguna cuota)
          await tx.cxPPago.delete({ where: { id: cuotaPago.pagoId } });

          // 8) Recalcular cuota: saldo = saldo + montoRevertido; estado/pagadaEn
          const montoRevertido = new Prisma.Decimal(cuotaPago.monto);
          const saldoNuevo = new Prisma.Decimal(cuota.saldo)
            .plus(montoRevertido)
            .toDecimalPlaces(2);

          const estadoNuevo = saldoNuevo.gte(new Prisma.Decimal(cuota.monto))
            ? ('PENDIENTE' as const)
            : ('PARCIAL' as const);

          await tx.cxPCuota.update({
            where: { id: cuota.id },
            data: {
              saldo: saldoNuevo,
              estado: estadoNuevo,
              pagadaEn: null, // al revertir un pago, dejamos null
            },
          });

          // 9) Recalcular documento: saldoPendiente y estado
          const agg = await tx.cxPCuota.aggregate({
            where: { documentoId },
            _sum: { saldo: true },
          });
          const saldoDoc = new Prisma.Decimal(
            agg._sum.saldo ?? 0,
          ).toDecimalPlaces(2);

          let estadoDoc: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANULADO' =
            'PARCIAL';
          if (saldoDoc.eq(0)) estadoDoc = 'PAGADO';
          else {
            const totalDoc = new Prisma.Decimal(doc.montoOriginal);
            if (saldoDoc.eq(totalDoc)) estadoDoc = 'PENDIENTE';
          }

          await tx.cxPDocumento.update({
            where: { id: documentoId },
            data: {
              saldoPendiente: saldoDoc,
              estado: estadoDoc,
            },
          });

          // 10) (Opcional) Si en create ataste una recepción a este pago (pago.compraRecepcionId),
          // decide aquí si la anulas/ajustas. Yo por ahora NO la toco para no mezclar responsabilidades.

          return { revertedAmount: montoRevertido.toNumber() };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      this.logger.error('Error en eliminar pago de cuota: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en módulo: eliminar pago de cuota',
      );
    }
  }

  //VER DETALLES DE LOS PRODUCTOS YA RECEPCIONADOS
  async getDetallesConRecepcion(compraId: number) {
    // 1) Detalles de la compra
    const detalles = await this.prisma.compraDetalle.findMany({
      where: { compraId },
      select: {
        id: true,
        cantidad: true, // pedido
        costoUnitario: true,
        creadoEn: true,
        actualizadoEn: true,
        fechaVencimiento: true, // si la guardas en detalle
        productoId: true,
        presentacionId: true,
        producto: {
          select: {
            id: true,
            nombre: true,
            codigoProducto: true,
            precioCostoActual: true,
          },
        },
        presentacion: {
          select: { id: true, nombre: true, codigoBarras: true },
        },
      },
    });

    // 2) Sumas recibidas por línea
    const recibidos = await this.prisma.compraRecepcionLinea.groupBy({
      by: ['compraDetalleId'],
      where: { compraRecepcion: { compraId } },
      _sum: { cantidadRecibida: true },
    });
    const recMap = new Map(
      recibidos.map((r) => [r.compraDetalleId, r._sum.cantidadRecibida ?? 0]),
    );

    // 3) Normalizado para la UI (pedido/recibido/pendiente)
    return detalles.map((d) => {
      const recibido = recMap.get(d.id) ?? 0;
      const pendiente = Math.max(0, d.cantidad - recibido);

      const esPresentacion = !!d.presentacionId;
      return {
        id: d.id,
        cantidad: d.cantidad,
        costoUnitario: d.costoUnitario,
        creadoEn: d.creadoEn.toISOString(),
        actualizadoEn: d.actualizadoEn.toISOString(),
        recibido,
        pendiente,
        producto: {
          id: esPresentacion ? d.presentacion!.id : d.producto!.id,
          nombre: esPresentacion ? d.presentacion!.nombre : d.producto!.nombre,
          codigo: esPresentacion
            ? (d.presentacion!.codigoBarras ?? undefined)
            : (d.producto!.codigoProducto ?? undefined),
          tipo: esPresentacion
            ? ('PRESENTACION' as const)
            : ('PRODUCTO' as const),
          precioCosto: d.costoUnitario,
          fechaVencimiento: d.fechaVencimiento
            ? d.fechaVencimiento.toISOString()
            : undefined,
        },
      };
    });
  }

  ///RECEPCIONAR PRODUCTOS ENVIANDO A BACK
  async creatStockFromCompraCreditoParcial(
    tx: Prisma.TransactionClient,
    dto: CreateComprasPagoConRecepcionDto,
  ) {
    const { recepcion, sucursalId, documentoId, registradoPorId } = dto;
    if (!recepcion || !recepcion.items?.length) return null;

    const header = await tx.compraRecepcion.create({
      data: {
        compraId: recepcion.compraId,
        usuarioId: registradoPorId,
        fecha: new Date(),
        observaciones: `Recepción generada desde pago de documento #${documentoId}`,
      },
      select: { id: true },
    });

    const newStockIds: number[] = [];
    const newStocksPresIds: number[] = [];

    for (const p of recepcion.items) {
      const fechaVenc = p.fechaVencimientoISO
        ? new Date(p.fechaVencimientoISO)
        : null;

      if (p.tipo === 'PRODUCTO') {
        const prod = await tx.producto.findUnique({
          where: { id: p.refId },
          select: { id: true, precioCostoActual: true },
        });
        if (!prod) throw new Error(`Producto ${p.refId} no encontrado`);

        // línea de recepción (PRODUCTO)
        const linea = await tx.compraRecepcionLinea.create({
          data: {
            compraRecepcionId: header.id,
            compraDetalleId: p.compraDetalleId,
            productoId: prod.id,
            cantidadRecibida: p.cantidad,
            fechaExpiracion: fechaVenc,
          },
          select: { id: true },
        });

        // lote base vinculado a la cabecera
        const stock = await tx.stock.create({
          data: {
            producto: { connect: { id: prod.id } },
            sucursal: { connect: { id: sucursalId } },
            cantidadInicial: p.cantidad,
            cantidad: p.cantidad,
            precioCosto: p.precioCosto ?? prod.precioCostoActual,
            costoTotal: (p.precioCosto ?? prod.precioCostoActual) * p.cantidad,
            fechaIngreso: new Date(),
            fechaVencimiento: fechaVenc,
            compraRecepcion: { connect: { id: header.id } },
          },
          select: { id: true },
        });

        newStockIds.push(stock.id);

        //  para PRODUCTO:
        await tx.compraRecepcionLinea.update({
          where: { id: linea.id },
          data: { stockId: stock.id },
        });
      }

      if (p.tipo === 'PRESENTACION') {
        const pres = await tx.productoPresentacion.findUnique({
          where: { id: p.refId },
          select: { id: true, productoId: true },
        });
        if (!pres) throw new Error(`Presentación ${p.refId} no encontrada`);

        const sp = await tx.stockPresentacion.create({
          data: {
            producto: { connect: { id: pres.productoId } },
            presentacion: { connect: { id: pres.id } },
            sucursal: { connect: { id: sucursalId } },
            cantidadRecibidaInicial: p.cantidad,
            cantidadPresentacion: p.cantidad,
            fechaIngreso: new Date(),
            fechaVencimiento: fechaVenc,
            compraRecepcion: { connect: { id: header.id } },
          },
          select: { id: true },
        });

        newStocksPresIds.push(sp.id);

        await tx.compraRecepcionLinea.create({
          data: {
            compraRecepcionId: header.id,
            compraDetalleId: p.compraDetalleId,
            presentacionId: pres.id,
            productoId: pres.productoId,
            cantidadRecibida: p.cantidad,
            fechaExpiracion: fechaVenc,
            stockPresentacionId: sp.id,
          },
        });
      }
    }

    await tx.cxPDocumentoRecepcion.upsert({
      where: {
        documentoId_recepcionId: { documentoId, recepcionId: header.id },
      },
      create: { documentoId, recepcionId: header.id },
      update: {},
    });

    return { recepcionId: header.id, newStockIds, newStocksPresIds };
  }

  async createProductsStocks(
    tx: Prisma.TransactionClient,
    items: CreateRecepcionItemDto[],
    sucursalId: number,
    compraRecepcionId: number,
  ) {
    const results = [];
    for (const p of items) {
      const prod = await tx.producto.findUnique({
        where: { id: p.refId },
        select: { id: true, precioCostoActual: true },
      });
      if (!prod) throw new Error(`Producto con ID ${p.refId} no encontrado`);

      await tx.stock.create({
        data: {
          producto: { connect: { id: prod.id } },
          cantidad: p.cantidad,
          precioCosto: prod.precioCostoActual,
          costoTotal: prod.precioCostoActual * p.cantidad,
          fechaIngreso: new Date(),
          sucursal: { connect: { id: sucursalId } },
        },
      });

      await tx.compraRecepcionLinea.create({
        data: {
          compraRecepcionId,
          compraDetalleId: p.compraDetalleId,
          productoId: prod.id,
          cantidadRecibida: p.cantidad,
          fechaExpiracion: p.fechaVencimientoISO
            ? new Date(p.fechaVencimientoISO)
            : null,
        },
      });

      results.push(true);
    }
    return results;
  }

  async creatPresentacionesStocks(
    tx: Prisma.TransactionClient,
    items: CreateRecepcionItemDto[],
    sucursalId: number,
    compraRecepcionId: number,
  ) {
    const results = [];
    for (const p of items) {
      const pres = await tx.productoPresentacion.findUnique({
        where: { id: p.refId },
        select: {
          id: true,
          productoId: true,
          costoReferencialPresentacion: true,
        },
      });
      if (!pres)
        throw new Error(`Presentación con ID ${p.refId} no encontrada`);

      const sp = await tx.stockPresentacion.create({
        data: {
          productoId: pres.productoId,
          presentacionId: pres.id,
          sucursalId,
          cantidadRecibidaInicial: p.cantidad,
          cantidadPresentacion: p.cantidad,
          fechaIngreso: new Date(),
          fechaVencimiento: p.fechaVencimientoISO
            ? new Date(p.fechaVencimientoISO)
            : null,
          compraRecepcionId,
        },
      });

      await tx.compraRecepcionLinea.create({
        data: {
          compraRecepcionId,
          compraDetalleId: p.compraDetalleId,
          presentacionId: pres.id,
          cantidadRecibida: p.cantidad,
          fechaExpiracion: p.fechaVencimientoISO
            ? new Date(p.fechaVencimientoISO)
            : null,
          stockPresentacionId: sp.id,
        },
      });

      results.push(true);
    }
    return results;
  }
}
