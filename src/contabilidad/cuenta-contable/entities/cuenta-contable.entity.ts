import { NaturalezaCuentaContable, TipoCuentaContable } from '../types/types';

export class CuentaContable {
  private readonly id: number;
  private readonly codigo: string;

  private nombre: string;
  private tipo: TipoCuentaContable;
  private naturaleza: NaturalezaCuentaContable;

  private permiteMovimiento: boolean;
  private activo: boolean;

  private padreId?: number;

  constructor(
    id: number,
    codigo: string,
    nombre: string,
    tipo: TipoCuentaContable,
    naturaleza: NaturalezaCuentaContable,
    permiteMovimiento: boolean = true,
    activo: boolean = true,
    padreId?: number,
  ) {
    this.validateCodigo(codigo);
    this.validateNombre(nombre);

    this.id = id;
    this.codigo = codigo;
    this.nombre = nombre;
    this.tipo = tipo;
    this.naturaleza = naturaleza;
    this.permiteMovimiento = permiteMovimiento;
    this.activo = activo;
    this.padreId = padreId;
  }

  // ========================
  // GETTERS
  // ========================

  public getId(): number {
    return this.id;
  }

  public getCodigo(): string {
    return this.codigo;
  }

  public getNombre(): string {
    return this.nombre;
  }

  public getTipo(): TipoCuentaContable {
    return this.tipo;
  }

  public getNaturaleza(): NaturalezaCuentaContable {
    return this.naturaleza;
  }

  public permiteMovimientos(): boolean {
    return this.permiteMovimiento;
  }

  public estaActiva(): boolean {
    return this.activo;
  }

  public getPadreId(): number | undefined {
    return this.padreId;
  }

  // ========================
  // COMPORTAMIENTO
  // ========================

  public rename(nuevoNombre: string): void {
    this.validateNombre(nuevoNombre);
    this.nombre = nuevoNombre;
  }

  public cambiarTipo(nuevoTipo: TipoCuentaContable): void {
    if (this.tipo === nuevoTipo) {
      throw new Error('El tipo ya está asignado');
    }
    this.tipo = nuevoTipo;
  }

  public cambiarNaturaleza(nuevaNaturaleza: NaturalezaCuentaContable): void {
    if (this.naturaleza === nuevaNaturaleza) {
      throw new Error('La naturaleza ya está asignada');
    }
    this.naturaleza = nuevaNaturaleza;
  }

  public activar(): void {
    if (this.activo) {
      throw new Error('La cuenta ya está activa');
    }
    this.activo = true;
  }

  public desactivar(): void {
    if (!this.activo) {
      throw new Error('La cuenta ya está desactivada');
    }
    this.activo = false;
  }

  public asignarPadre(padreId: number): void {
    if (!padreId || padreId <= 0) {
      throw new Error('Padre inválido');
    }

    if (padreId === this.id) {
      throw new Error('Una cuenta no puede ser su propio padre');
    }

    this.padreId = padreId;
  }

  public quitarPadre(): void {
    this.padreId = undefined;
  }

  public permitirMovimiento(): void {
    if (this.permiteMovimiento) {
      throw new Error('La cuenta ya permite movimientos');
    }
    this.permiteMovimiento = true;
  }

  public bloquearMovimiento(): void {
    if (!this.permiteMovimiento) {
      throw new Error('La cuenta ya está bloqueada para movimientos');
    }
    this.permiteMovimiento = false;
  }

  // ========================
  // VALIDACIONES
  // ========================

  private validateNombre(nombre: string): void {
    if (!nombre || nombre.trim().length < 3) {
      throw new Error('Nombre de cuenta inválido');
    }
    this.nombre = nombre.trim();
  }

  private validateCodigo(codigo: string): void {
    const regex = /^[0-9]+(\.[0-9]+)*$/;

    if (!codigo || !regex.test(codigo)) {
      throw new Error('Código inválido. Ej: 1, 1.1, 1.1.01');
    }
  }
}
