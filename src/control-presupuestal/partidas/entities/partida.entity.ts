export class PartidaPresupuestal {
  private readonly id: number;
  private readonly codigo: string;

  private nombre: string;
  private descripcion: string | null;

  private estado: boolean;

  constructor(
    id: number,
    codigo: string,
    nombre: string,
    descripcion: string | null = null,
    estado: boolean = true, //El default
  ) {
    this.validateNombre(nombre);
    this.validateCodigo(codigo);

    this.id = id;
    this.codigo = codigo;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.estado = estado;
  }

  //   GETTERS

  public getId(): number {
    return this.id;
  }
  public getCodigo(): string {
    return this.codigo;
  }
  public getNombre(): string {
    return this.nombre;
  }

  public getDescripcion(): string {
    return this.descripcion;
  }
  public getEstado(): boolean {
    return this.estado;
  }

  //   METHODS

  public desactivate(): void {
    if (!this.estado) {
      throw new Error('La partida presupuestal ya está desactivada');
    }
    this.estado = false;
  }

  public activate(): void {
    if (this.estado) {
      throw new Error('La partida presupuestal ya está activada');
    }
    this.estado = true;
  }

  public rename(newName: string, newDesc?: string): void {
    this.validateNombre(newName);
    this.nombre = newName;

    if (newDesc !== undefined) {
      this.descripcion = newDesc;
    }
  }

  private validateNombre(nombre: string): void {
    if (!nombre || nombre.trim().length < 3) {
      throw new Error('Nombre ingresado no válido');
    }
  }

  private validateCodigo(codigo: string): void {
    const regex = /^[A-Z0-9]+-[A-Z0-9]+$/i;
    if (!codigo || !regex.test(codigo)) {
      throw new Error(
        'El código de la partida debe tener el formato XXXX-YYY (Ej. 5100-PAP).',
      );
    }
  }
}
