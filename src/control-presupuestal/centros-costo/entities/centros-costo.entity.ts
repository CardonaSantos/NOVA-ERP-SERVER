export class CentroCosto {
  private readonly id: number;
  private readonly codigo: string;

  private nombre: string;

  private activo: boolean;
  private sucursalId: number;

  constructor(
    id: number,
    codigo: string,
    nombre: string,
    activo: boolean = true,
    sucursalId: number,
  ) {
    this.validateName(nombre);
    this.validateCodigo(codigo);

    this.id = id;
    this.codigo = codigo;
    this.nombre = nombre;
    this.activo = activo;
    this.sucursalId = sucursalId;
  }

  public getId(): number {
    return this.id;
  }

  public getSucursalId(): number {
    return this.sucursalId;
  }

  public getCodigo(): string {
    return this.codigo;
  }
  public getNombre(): string {
    return this.nombre;
  }

  public getEstado(): boolean {
    return this.activo;
  }

  public deactivate(): void {
    if (!this.activo) {
      throw new Error('El registro ya está desactivado');
    }
    this.activo = false;
  }

  public activate(): void {
    if (this.activo) {
      throw new Error('El registro ya está activado');
    }
    this.activo = true;
  }

  public rename(newName: string): void {
    this.validateName(newName);
    this.nombre = newName;
  }

  public vinculateSucursal(sucursalId: number) {
    if (!sucursalId) {
      throw new Error('Sucursal ID no válido');
    }
    this.sucursalId = sucursalId;
  }

  private validateName(newName: string, newDesc?: string): void {
    if (!newName || newName.trim().length < 3) {
      throw new Error('Nombre no válido');
    }
    this.nombre = newName.trim();
  }

  private validateCodigo(code: string): void {
    const regex = /^[A-Z0-9]+-[A-Z0-9]+$/i;
    if (!code || !regex.test(code)) {
      throw new Error(
        'El código de la partida debe tener el formato XXXX-YYY (Ej. 5100-PAP).',
      );
    }
  }
}
