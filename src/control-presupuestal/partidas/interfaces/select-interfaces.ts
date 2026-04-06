export interface PartidaSelect {
  id: number;
  nombre: string;
  creadoEn: Date;
  presupuestos: {
    montoDisponible: number;
  }[];
}
[];
