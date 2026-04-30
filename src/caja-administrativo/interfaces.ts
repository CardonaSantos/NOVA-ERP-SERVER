import { CostoVentaTipo, GastoOperativoTipo } from '@prisma/client';

export type CostoAsociadoTipo =
  | 'FLETE'
  | 'ENCOMIENDA'
  | 'TRANSPORTE'
  | 'OTROS'
  | 'MERCADERIA';

export interface DetalleMovimiento {
  id: number;
  fecha: string;
  sucursal: { id: number; nombre: string } | null;
  clasificacion: string;
  motivo: string | null;
  costoVentaTipo: CostoAsociadoTipo | null;
  gastoOperativoTipo: GastoOperativoTipo | null;
  deltaCaja: number;
  deltaBanco: number;
  monto: number; // |deltaCaja + deltaBanco| para visualizar
  descripcion: string;
  referencia: string;
  conFactura: boolean | null;
}

export interface PorDiaItem {
  fecha: string; // YYYY-MM-DD (en TZGT)
  ventas: number;
  otrosIngresos: number;
  devoluciones: number;
  costoMercaderia: number;
  costosAsociados: number;
  gastosOperativos: number;
  ajustes: number;
  utilidadNetaDia: number;
}

//FLUJO EFECTIVO DIARIO =>

export type DireccionTransfer = 'CAJA_A_BANCO' | 'BANCO_A_CAJA';

export interface DetalleFlujo {
  id: number;
  fecha: string; // ISO
  sucursal: { id: number; nombre: string } | null;
  clasificacion: string | null; // 'INGRESO','GASTO_OPERATIVO','TRANSFERENCIA', etc.
  motivo: string | null; // 'VENTA','DEPOSITO_CIERRE','DEPOSITO_PROVEEDOR', etc.
  deltaCaja: number;
  deltaBanco: number;
  montoAbs: number; // |deltaCaja + deltaBanco| para visualizar
  descripcion: string;
  referencia: string;
  // Extra: marcar si es transferencia y su dirección
  esTransferencia: boolean;
  direccionTransfer?: DireccionTransfer;
}

export interface PorDiaFlujo {
  fecha: string; // YYYY-MM-DD (TZGT)
  ingresosCaja: number;
  egresosCaja: number;
  ingresosBanco: number;
  egresosBanco: number;
  // Transferencias separadas
  transferCajaABanco: number; // suma de montos que salieron de caja hacia banco (egreso caja, ingreso banco)
  transferBancoACaja: number; // suma de montos que salieron de banco hacia caja (egreso banco, ingreso caja)
  // Neto/día (variación del día por canal)
  movimientoNetoCaja: number; // sum(deltaCaja)
  movimientoNetoBanco: number; // sum(deltaBanco)
  movimientoNetoTotal: number; // sum(deltaCaja + deltaBanco)
}

export interface ResumenPeriodoFlujo {
  ingresosCaja: number;
  egresosCaja: number;
  ingresosBanco: number;
  egresosBanco: number;
  transferCajaABanco: number;
  transferBancoACaja: number;
  // Totales incluyendo transferencias (visión operativa pura)
  saldoNetoCaja_conTransfers: number; // sum(movimientoNetoCaja)
  saldoNetoBanco_conTransfers: number; // sum(movimientoNetoBanco)
  saldoNetoTotal_conTransfers: number; // caja+banco
  // Totales excluyendo transferencias (útil para comparables financieros)
  ingresosCaja_sinTransfers: number;
  egresosCaja_sinTransfers: number;
  ingresosBanco_sinTransfers: number;
  egresosBanco_sinTransfers: number;
  saldoNetoCaja_sinTransfers: number;
  saldoNetoBanco_sinTransfers: number;
  saldoNetoTotal_sinTransfers: number;
}

// GASTOS OPERATIVOS HISTORICOS =>

export interface GO_Detalle {
  id: number;
  fecha: string; // ISO
  fechaDia: string; // YYYY-MM-DD en TZGT
  sucursal: { id: number; nombre: string } | null;
  proveedor: { id: number; nombre: string } | null;
  tipo: GastoOperativoTipo | null;
  conFactura: boolean;

  deltaCaja: number; // negativos (egresos)
  deltaBanco: number; // negativos (egresos)

  egresoCaja: number; // max(0, -deltaCaja)
  egresoBanco: number; // max(0, -deltaBanco)
  monto: number; // egresoCaja + egresoBanco (siempre ≥ 0)

  descripcion: string;
  referencia: string;
}

export interface GO_PorDia {
  fecha: string; // YYYY-MM-DD TZGT
  total: number;
  caja: number;
  banco: number;
  // breakdown por categoría
  SALARIO: number;
  ENERGIA: number;
  LOGISTICA: number;
  RENTA: number;
  INTERNET: number;
  PUBLICIDAD: number;
  VIATICOS: number;
  OTROS: number;
}

export interface GO_Resumen {
  totalGeneral: number;
  porCategoria: Record<GastoOperativoTipo, number>;
  porCanal: { caja: number; banco: number };
  porFactura: { conFactura: number; sinFactura: number };
  proveedoresTop: { proveedorId: number; nombre: string; total: number }[];
}

export interface CV_Detalle {
  id: number;
  fecha: string; // ISO
  fechaDia: string; // YYYY-MM-DD (TZGT)
  sucursal: { id: number; nombre: string } | null;
  proveedor: { id: number; nombre: string } | null;
  tipo: CostoVentaTipo; // tipo final usado para agrupar
  motivo: string | null;
  conFactura: boolean;

  // crudo (signado)
  deltaCaja: number;
  deltaBanco: number;

  // derivados (positivos)
  egresoCaja: number; // max(0, -deltaCaja)
  egresoBanco: number; // max(0, -deltaBanco)
  monto: number; // egresoCaja + egresoBanco

  descripcion: string;
  referencia: string;
}

export interface CV_Resumen {
  totalGeneral: number;
  porCategoria: Record<CostoVentaTipo, number>;
  porCanal: { caja: number; banco: number };
  porFactura: { conFactura: number; sinFactura: number };
  proveedoresTop: { proveedorId: number; nombre: string; total: number }[];
}

export interface CV_PorDia {
  fecha: string; // YYYY-MM-DD (TZGT)
  total: number;
  caja: number;
  banco: number;
  MERCADERIA: number;
  FLETE: number;
  ENCOMIENDA: number;
  TRANSPORTE: number;
  OTROS: number;
}
