import { EstadoAsientoContable, OrigenAsientoContable } from '@prisma/client';

export interface AsientoContableResponse {
  id: number;

  fecha: string;
  descripcion: string;
  referencia?: string | null;

  origen: OrigenAsientoContable;
  origenId?: number | null;

  estado: EstadoAsientoContable;

  sucursalId?: number | null;
  usuarioId?: number | null;

  totalDebe: number;
  totalHaber: number;

  creadoEn: string;
  actualizadoEn: string;

  lineas: AsientoContableLinea[];
}

export interface AsientoContableLinea {
  id: number;

  asientoContableId: number;
  cuentaContableId: number;

  debe: number;
  haber: number;

  descripcion?: string | null;

  centroCostoId?: number | null;
  partidaPresupuestalId?: number | null;

  proveedorId?: number | null;
  clienteId?: number | null;
  productoId?: number | null;

  ventaId?: number | null;
  compraId?: number | null;
  movimientoFinancieroId?: number | null;

  cxpDocumentoId?: number | null;
  cxpPagoId?: number | null;
  abonoCreditoId?: number | null;

  historialStockId?: number | null;

  creadoEn: string;
  actualizadoEn: string;
}
