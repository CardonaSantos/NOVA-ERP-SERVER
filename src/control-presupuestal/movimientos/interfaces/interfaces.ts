export enum TipoMovimientoPresupuesto {
  ASIGNACION_INICIAL = 'ASIGNACION_INICIAL',
  COMPROMISO = 'COMPROMISO',
  EJERCICIO = 'EJERCICIO',
  LIBERACION_COMPROMISO = 'LIBERACION_COMPROMISO',
  LIBERACION_EJERCICIO = 'LIBERACION_EJERCICIO',
  AJUSTE_MANUAL = 'AJUSTE_MANUAL', // Agrupa ampliaciones y reducciones aquí
}

// ── View para una fila de la tabla de movimientos ─────────────────────────────
export interface MovimientoTableRow {
  id: number;
  fecha: Date;
  tipo: TipoMovimientoPresupuesto;
  monto: number;
  descripcion: string | null;

  // Columna "Presupuesto" → "5100-PAP / DEP-SIS"
  partida: {
    codigo: string;
    nombre: string;
  };
  centroCosto: {
    codigo: string | null;
    nombre: string;
  };
  periodo: {
    id: number;
    nombre: string;
  };

  // Columna "Usuario" → iniciales o nombre
  usuario: string;

  // Columna "Origen" → "Req #88" | "OC-41" | "—"
  origen: {
    tipo: 'requisicion' | 'compra' | 'manual' | null;
    referencia: string;
    id: number | null;
  };
}

// ── Respuesta paginada ─────────────────────────────────────────────────────────
export interface PaginatedMovimientos {
  data: MovimientoTableRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MovimientoFiltros {
  periodoId?: number;
  centroCostoId?: number;
  tipo?: TipoMovimientoPresupuesto;
  page?: number; // default: 1
  pageSize?: number; // default: 20
}
