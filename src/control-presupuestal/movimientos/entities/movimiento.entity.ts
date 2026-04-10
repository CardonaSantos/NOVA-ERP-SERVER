import { TipoMovimientoPresupuesto } from '../interfaces/interfaces';

export class MovimientoPresupuesto {
  // un movimiento financiero jamás muta.
  private readonly id: number;
  private readonly presupuestoId: number;
  private readonly tipoMovimiento: TipoMovimientoPresupuesto;
  private readonly monto: number;
  private readonly descripcion: string | null;
  private readonly requisicionId: number | null;
  private readonly compraId: number | null;
  private readonly usuarioId: number | null;
  private readonly fechaMovimiento: Date;

  constructor(
    id: number,
    presupuestoId: number,
    tipoMovimiento: TipoMovimientoPresupuesto,
    monto: number,
    fechaMovimiento: Date = new Date(),
    descripcion: string | null = null,
    requisicionId: number | null = null,
    compraId: number | null = null,
    usuarioId: number | null = null,
  ) {
    if (presupuestoId <= 0) {
      throw new Error('El ID del presupuesto es inválido.');
    }

    if (monto <= 0) {
      throw new Error(
        'El monto del movimiento debe ser estrictamente mayor a cero.',
      );
    }

    if (!Object.values(TipoMovimientoPresupuesto).includes(tipoMovimiento)) {
      throw new Error('Tipo de movimiento presupuestal no reconocido.');
    }

    // Validaciones de Reglas de Negocio (Trazabilidad)
    if (
      tipoMovimiento === TipoMovimientoPresupuesto.COMPROMISO &&
      !requisicionId
    ) {
      throw new Error(
        'Un compromiso requiere obligatoriamente el ID de una Requisición de respaldo.',
      );
    }

    if (tipoMovimiento === TipoMovimientoPresupuesto.EJERCICIO && !compraId) {
      throw new Error(
        'Un ejercicio de presupuesto requiere obligatoriamente el ID de una Compra o Factura de respaldo.',
      );
    }

    this.id = id;
    this.presupuestoId = presupuestoId;
    this.tipoMovimiento = tipoMovimiento;
    this.monto = this.round(monto);
    this.descripcion = descripcion;
    this.requisicionId = requisicionId;
    this.compraId = compraId;
    this.usuarioId = usuarioId;
    this.fechaMovimiento = fechaMovimiento;
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // --- Getters
  public getId(): number {
    return this.id;
  }
  public getPresupuestoId(): number {
    return this.presupuestoId;
  }
  public getTipoMovimiento(): TipoMovimientoPresupuesto {
    return this.tipoMovimiento;
  }
  public getMonto(): number {
    return this.monto;
  }
  public getDescripcion(): string | null {
    return this.descripcion;
  }
  public getRequisicionId(): number | null {
    return this.requisicionId;
  }
  public getCompraId(): number | null {
    return this.compraId;
  }
  public getUsuarioId(): number | null {
    return this.usuarioId;
  }
  public getFechaMovimiento(): Date {
    return this.fechaMovimiento;
  }
}
