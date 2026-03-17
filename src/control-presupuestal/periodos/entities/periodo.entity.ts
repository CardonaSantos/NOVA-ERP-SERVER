import { error } from 'console';
import { dateUtils } from 'src/utils/dateUtils';

export enum EstadoPeriodo {
  ABIERTO = 'ABIERTO',
  CERRADO = 'CERRADO',
  BLOQUEADO = 'BLOQUEADO',
}
export class PeriodoPresupuestal {
  private readonly id: number;

  private nombre: string;
  private fechaInicio: string;
  private fechaFin: string;
  private estado: EstadoPeriodo;

  constructor(
    id: number,
    nombre: string,
    fechaInicio: string,
    fechaFin: string,
    estado: EstadoPeriodo,
  ) {
    this.validateFechas(fechaInicio, fechaFin);
    this.validateNombre(nombre);
    this.id = id;
    this.nombre = nombre;
    this.fechaInicio = fechaInicio;
    this.fechaFin = fechaFin;
    this.estado = estado;
  }

  public getId(): number {
    return this.id;
  }
  public getNombre(): string {
    return this.nombre;
  }
  public getFechaInicio(): string {
    return this.fechaInicio;
  }
  public getFin(): string {
    return this.fechaFin;
  }
  public getRange(): { inicio: string; fin: string } {
    return {
      inicio: this.fechaInicio,
      fin: this.fechaFin,
    };
  }
  public getEstado(): EstadoPeriodo {
    return this.estado;
  }

  private validateNombre(newName: string) {
    if (!newName || newName.trim().length < 3) {
      throw new Error('Error nombre no válido');
    }
    this.nombre = newName.trim();
  }
  private validateFechas(inicio: string, fin: string) {
    const start = dateUtils(inicio);
    const end = dateUtils(fin);

    if (!start.isValid() || !end.isValid()) {
      throw new Error('Formato de fecha no válido');
    }

    if (end.isSameOrBefore(start)) {
      throw new Error(
        'La fecha de fin debe ser posterior a la fecha de inicio',
      );
    }
  }

  public rename(newName: string) {
    this.validateNombre(newName);
    this.nombre = newName;
  }

  public changeEstado(nuevoEstado: EstadoPeriodo): void {
    const estadosValidos = Object.values(EstadoPeriodo) as string[];

    if (!estadosValidos.includes(nuevoEstado)) {
      throw new Error(
        `El estado "${nuevoEstado}" no es válido para el Periodo.`,
      );
    }

    if (this.estado === EstadoPeriodo.CERRADO) {
      throw new Error(
        'No se puede cambiar el estado de un periodo que ya está CERRADO.',
      );
    }

    this.estado = nuevoEstado;
  }

  public changeRange(nuevoInicio: string, nuevoFin: string) {
    this.validateFechas(nuevoInicio, nuevoFin);
    this.fechaInicio = nuevoInicio;
    this.fechaFin = nuevoFin;
  }
}
