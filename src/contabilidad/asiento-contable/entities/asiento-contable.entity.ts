import { EstadoAsientoContable, OrigenAsientoContable } from '@prisma/client';
import { AsientoContableLinea } from './asiento-contable-linea.entity';

export class AsientoContable {
  private readonly id: number;
  private readonly fecha: Date;
  private readonly origen: OrigenAsientoContable;
  private readonly origenId?: number;

  private descripcion: string;
  private estado: EstadoAsientoContable;

  private lineas: AsientoContableLinea[] = [];

  constructor(
    id: number,
    fecha: Date,
    descripcion: string,
    origen: OrigenAsientoContable,
    origenId?: number,
    estado: EstadoAsientoContable = EstadoAsientoContable.BORRADOR,
  ) {
    this.validateDescripcion(descripcion);

    this.id = id;
    this.fecha = fecha || new Date();
    this.descripcion = descripcion;
    this.origen = origen;
    this.origenId = origenId;
    this.estado = estado;
  }

  // ========================
  // GETTERS
  // ========================
  public getId(): number {
    return this.id;
  }

  public getFecha(): Date {
    return this.fecha;
  }

  public getDescripcion(): string {
    return this.descripcion;
  }

  public getEstado(): EstadoAsientoContable {
    return this.estado;
  }

  public getLineas(): AsientoContableLinea[] {
    return this.lineas;
  }

  public getOrigen(): OrigenAsientoContable {
    return this.origen;
  }

  public getOrigenId(): number | undefined {
    return this.origenId;
  }

  // ========================
  // COMPORTAMIENTO
  // ========================

  public agregarLinea(linea: AsientoContableLinea): void {
    if (this.estado !== 'BORRADOR') {
      throw new Error('No se pueden modificar asientos no borrador');
    }

    this.lineas.push(linea);
  }

  public calcularTotales(): { debe: number; haber: number } {
    let totalDebe = 0;
    let totalHaber = 0;

    for (const linea of this.lineas) {
      totalDebe += linea.getDebe();
      totalHaber += linea.getHaber();
    }

    return { debe: totalDebe, haber: totalHaber };
  }

  public validarBalance(): void {
    const { debe, haber } = this.calcularTotales();

    if (debe !== haber) {
      throw new Error(
        `El asiento está desbalanceado. Debe: ${debe}, Haber: ${haber}`,
      );
    }
  }

  public postear(): void {
    if (this.estado !== 'BORRADOR') {
      throw new Error('El asiento ya fue procesado');
    }

    if (this.lineas.length === 0) {
      throw new Error('El asiento no tiene líneas');
    }

    this.validarBalance();

    this.estado = 'POSTEADO';
  }

  public anular(): void {
    if (this.estado === 'ANULADO') {
      throw new Error('El asiento ya está anulado');
    }

    this.estado = 'ANULADO';
  }

  private validateDescripcion(desc: string): void {
    if (!desc || desc.trim().length < 5) {
      throw new Error('Descripción inválida');
    }
    this.descripcion = desc.trim();
  }

  public generarReversa(): AsientoContable {
    if (this.estado !== 'POSTEADO') {
      throw new Error('Solo se pueden revertir asientos posteados');
    }

    const reversa = new AsientoContable(
      0,
      new Date(),
      `Reversa de asiento ${this.id}`,
      this.origen,
      this.origenId,
    );

    for (const linea of this.lineas) {
      reversa.agregarLinea(
        new AsientoContableLinea(
          linea.getCuentaContableId(),
          linea.getHaber(), // invertido
          linea.getDebe(), // invertido
          `Reversa: ${linea.getDescripcion() || ''}`,
        ),
      );
    }

    reversa.validarBalance();

    return reversa;
  }

  //HIDRATACION DE LINEAS
  public hydrateLineas(lineas: AsientoContableLinea[]) {
    this.lineas = lineas;
  }
}
