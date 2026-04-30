import { ComprobanteTipo, TipoComprobante } from '@prisma/client';

type CierreModo =
  | 'DEPOSITO_TODO'
  | 'DEPOSITO_PARCIAL'
  | 'SIN_DEPOSITO'
  | 'CAMBIO_TURNO';

export interface CerrarCajaV3Dto {
  registroCajaId: number;
  usuarioCierreId: number;
  comentarioFinal?: string;

  efectivoContado?: number;
  comentarioCuadre?: string;
  // Depósito
  modo: CierreModo;
  cuentaBancariaId?: number; // requerido si deposito > 0
  montoParcial?: number; // requerido si modo == 'DEPOSITO_PARCIAL'
  dejarEnCaja?: number; // base a dejar; default: turno.fondoFijo

  // Ventas
  asentarVentas?: boolean; // default: true

  // Cambio de turno (opcional)
  abrirSiguiente?: boolean; // default: modo == 'CAMBIO_TURNO'
  usuarioInicioSiguienteId?: number; // default: usuarioCierreId
  fondoFijoSiguiente?: number; // default: turno.fondoFijo
  comentarioAperturaSiguiente?: string;

  comprobanteTipo?: ComprobanteTipo;
  comprobanteNumero?: string;
  comprobanteFecha?: string;
}
