export class AsientoContableLinea {
  private readonly cuentaContableId: number;

  private readonly debe: number;
  private readonly haber: number;

  private readonly descripcion?: string;

  constructor(
    cuentaContableId: number,
    debe: number,
    haber: number,
    descripcion?: string,
  ) {
    this.validateCuenta(cuentaContableId);
    this.validateValores(debe, haber);

    this.cuentaContableId = cuentaContableId;
    this.debe = debe;
    this.haber = haber;
    this.descripcion = descripcion;
  }

  public getCuentaContableId(): number {
    return this.cuentaContableId;
  }

  public getDebe(): number {
    return this.debe;
  }

  public getHaber(): number {
    return this.haber;
  }

  public getDescripcion(): string | undefined {
    return this.descripcion;
  }

  private validateCuenta(id: number) {
    if (!id || id <= 0) {
      throw new Error('Cuenta contable inválida');
    }
  }

  private validateValores(debe: number, haber: number) {
    if (debe < 0 || haber < 0) {
      throw new Error('Debe/Haber no pueden ser negativos');
    }

    if (debe === 0 && haber === 0) {
      throw new Error('Debe o Haber debe tener valor');
    }

    if (debe > 0 && haber > 0) {
      throw new Error('Una línea no puede tener debe y haber al mismo tiempo');
    }
  }
}
