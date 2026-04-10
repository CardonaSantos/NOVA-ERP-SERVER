export class Presupuesto {
  private readonly id: number;
  private readonly periodoId: number;
  private readonly centroCostoId: number;
  private readonly partidaId: number;

  private montoAsignado: number;
  private montoComprometido: number;
  private montoEjercido: number;

  constructor(
    id: number,
    centroCostoId: number,
    periodoId: number,
    partidaId: number,
    montoAsignado: number,
    montoComprometido: number = 0,
    montoEjercido: number = 0,
  ) {
    if (centroCostoId <= 0 || periodoId <= 0 || partidaId <= 0) {
      throw new Error(
        'Las referencias (IDs) del presupuesto deben ser válidas y mayores a 0.',
      );
    }

    if (montoAsignado < 0) {
      throw new Error(
        'El presupuesto inicial (asignado) no puede ser negativo.',
      );
    }

    this.id = id;
    this.centroCostoId = centroCostoId;
    this.periodoId = periodoId;
    this.partidaId = partidaId;

    this.montoAsignado = this.round(montoAsignado);
    this.montoComprometido = this.round(montoComprometido);
    this.montoEjercido = this.round(montoEjercido);
  }

  /**
   *  Utilidad de redondeo financiero (2 decimales)
   */
  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // --- Propiedad Derivada
  public get montoDisponible(): number {
    return this.round(
      this.montoAsignado - (this.montoComprometido + this.montoEjercido),
    );
  }

  public liberarCompromiso(monto: number): void {
    if (monto <= 0) {
      throw new Error('El monto a liberar debe ser mayor a cero.');
    }

    if (monto > this.montoComprometido) {
      throw new Error(
        `No se puede liberar ${monto} porque solo hay ${this.montoComprometido} comprometido.`,
      );
    }

    this.montoComprometido = this.round(this.montoComprometido - monto);
  }

  public ampliarPresupuesto(cantidad: number): void {
    if (cantidad <= 0)
      throw new Error('La ampliación debe ser una cantidad positiva.');
    this.montoAsignado = this.round(this.montoAsignado + cantidad);
  }

  public decrementarPresupuesto(cantidad: number): void {
    if (cantidad <= 0)
      throw new Error('La cantidad a reducir debe ser positiva.');

    //reducir el presupuesto por debajo del apartado o gastado
    const nuevoTotal = this.round(this.montoAsignado - cantidad);
    const montoMinimoRequerido = this.round(
      this.montoComprometido + this.montoEjercido,
    );

    if (nuevoTotal < montoMinimoRequerido) {
      throw new Error(
        `No se puede reducir el presupuesto a ${nuevoTotal} porque ya hay ${montoMinimoRequerido} comprometido/ejercido.`,
      );
    }

    this.montoAsignado = nuevoTotal;
  }

  public comprometer(cantidad: number): void {
    const monto = this.round(cantidad);
    if (monto <= 0)
      throw new Error('El monto a comprometer debe ser positivo.');

    if (monto > this.montoDisponible) {
      throw new Error(
        `Saldo insuficiente. Disponible: ${this.montoDisponible}, Requerido: ${monto}`,
      );
    }

    this.montoComprometido = this.round(this.montoComprometido + monto);
  }

  public ejercer(cantidad: number): void {
    const monto = this.round(cantidad);
    if (monto <= 0) throw new Error('El monto a ejercer debe ser positivo.');

    // Solo se puede ejercer lo que se comprometió previamente
    if (monto > this.montoComprometido) {
      throw new Error(
        'No se puede ejercer un monto mayor al que ha sido comprometido.',
      );
    }

    // El dinero se desplaza: sale de la reserva (comprometido) y entra al gasto real (ejercido)
    this.montoComprometido = this.round(this.montoComprometido - monto);
    this.montoEjercido = this.round(this.montoEjercido + monto);
  }

  public anularCompromiso(cantidad: number): void {
    const monto = this.round(cantidad);
    if (monto <= 0) throw new Error('Monto de anulación inválido.');

    if (monto > this.montoComprometido) {
      throw new Error(
        'No hay suficiente saldo comprometido para anular esa cantidad.',
      );
    }

    this.montoComprometido = this.round(this.montoComprometido - monto);
  }

  public getId(): number {
    return this.id;
  }
  public getPeriodoId(): number {
    return this.periodoId;
  }
  public getCentroCostoId(): number {
    return this.centroCostoId;
  }
  public getPartidaId(): number {
    return this.partidaId;
  }
  public getMontoAsignado(): number {
    return this.montoAsignado;
  }
  public getMontoComprometido(): number {
    return this.montoComprometido;
  }
  public getMontoEjercido(): number {
    return this.montoEjercido;
  }
}
