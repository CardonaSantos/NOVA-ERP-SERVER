export interface PresupuestoDetalleView {
  id: number;
  montoAsignado: number;
  montoComprometido: number;
  montoEjercido: number;
  montoDisponible: number;

  // Metadatos
  periodo: {
    fechaInicio: string;
    fechaFin: string;
    estado: string;
    nombre: string;
  }; // "Marzo 2026"
  centroCosto: {
    codigo: string;
    nombre: string;
    activo: boolean;
  }; // "Sistemas"
  sucursal: string; // "Central Norte"
  partida: {
    codigo: string;
    nombre: string;
    descripcion: string;
  };

  // El historial detallado (Ledger)
  historial: Array<{
    id: number;
    fecha: Date;
    tipo: string;
    monto: number;
    descripcion: string | null;
    usuario: string; // Nombre del que lo hizo
    referencia: string; // "REQ-003" o "OC-10" o "N/A"
  }>;
}

export interface PresupuestosPartidasSelect {
  id: number;
  montoDisponible: number;
  partida: string;
  partidaId: number;
  fechaFin: Date;
  fechaInicio: Date;
}
