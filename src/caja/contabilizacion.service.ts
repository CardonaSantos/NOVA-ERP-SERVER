import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
  Prisma,
} from '@prisma/client';
import { ReglaContableService } from 'src/contabilidad/regla-contable/app/regla-contable.service';
import { AsientoContableService } from 'src/contabilidad/asiento-contable/app/asiento-contable.service';

export interface RegistrarVentaContableTxInput {
  ventaId: number;
  sucursalId: number;
  usuarioId: number;
  totalVenta: number;
  metodoPago: MetodoPago;
  registroCajaId?: number | null;
  referencia?: string | null;
  descripcion?: string | null;
}

@Injectable()
export class ContabilizacionVentasService {
  private readonly logger = new Logger(ContabilizacionVentasService.name);

  constructor(
    private readonly reglaContableService: ReglaContableService,
    private readonly asientoContableService: AsientoContableService,
  ) {}

  async registrarVentaTx(
    tx: Prisma.TransactionClient,
    input: RegistrarVentaContableTxInput,
  ): Promise<{
    movimientoFinancieroId: number;
    asientoContableId: number | null;
  }> {
    const total = Number(input.totalVenta);
    if (!Number.isFinite(total) || total <= 0) {
      throw new BadRequestException('El total de la venta debe ser mayor a 0');
    }

    const esEfectivo =
      input.metodoPago === MetodoPago.EFECTIVO ||
      input.metodoPago === MetodoPago.CONTADO;

    const esCredito = input.metodoPago === MetodoPago.CREDITO;

    const motivo = esCredito
      ? MotivoMovimiento.VENTA_CREDITO
      : MotivoMovimiento.VENTA;

    const deltaCaja = esCredito ? 0 : esEfectivo ? total : 0;
    const deltaBanco = esCredito ? 0 : !esEfectivo ? total : 0;

    const movimiento = await tx.movimientoFinanciero.create({
      data: {
        fecha: new Date(),
        sucursalId: input.sucursalId,
        registroCajaId: input.registroCajaId ?? null,
        clasificacion: ClasificacionAdmin.INGRESO,
        motivo,
        metodoPago: input.metodoPago,
        deltaCaja,
        deltaBanco,
        descripcion: input.descripcion ?? `Venta #${input.ventaId}`,
        referencia: input.referencia ?? null,
        usuarioId: input.usuarioId,
        esDepositoCierre: false,
        esDepositoProveedor: false,
        afectaInventario: false,
      },
    });

    const regla = await this.reglaContableService.resolverRegla(
      {
        origen: OrigenAsientoContable.VENTA,
        clasificacion: ClasificacionAdmin.INGRESO,
        motivo,
        metodoPago: input.metodoPago,
      },
      tx,
    );

    const asiento = await this.asientoContableService.crearDesdeRegla(
      {
        descripcion: input.descripcion ?? `Venta #${input.ventaId}`,
        origen: OrigenAsientoContable.VENTA,
        origenId: movimiento.id,
        monto: total,
        cuentaDebeId: regla.getCuentaDebeId(),
        cuentaHaberId: regla.getCuentaHaberId(),
      },
      tx,
    );

    await tx.movimientoFinanciero.update({
      where: { id: movimiento.id },
      data: {
        asientoContableId: asiento.getId(),
      },
    });

    this.logger.log(
      `Venta contable OK ventaId=${input.ventaId} mov=${movimiento.id} asiento=${asiento.getId()}`,
    );

    return {
      movimientoFinancieroId: movimiento.id,
      asientoContableId: asiento.getId(),
    };
  }
}
