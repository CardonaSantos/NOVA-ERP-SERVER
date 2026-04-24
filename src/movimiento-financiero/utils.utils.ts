import { BadRequestException } from '@nestjs/common';
import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
} from '@prisma/client';

enum CanalMovimiento {
  CAJA,
  BANCO,
  NINGUNO,
}

export type MovimientoEffects = {
  clasificacion: ClasificacionAdmin;
  deltaCaja: number;
  deltaBanco: number;
  necesitaTurno: boolean;
  afectaInventario: boolean;
  requiereCuentaBancaria: boolean;
  requiereRegistroCaja: boolean;
};

export type MovementContext = {
  motivo: MotivoMovimiento;
  metodoPago?: MetodoPago;
  monto: number;
};

const mapMetodoPagoToCanal = (metodo?: MetodoPago): CanalMovimiento => {
  switch (metodo) {
    case MetodoPago.CONTADO:
    case MetodoPago.EFECTIVO:
      return CanalMovimiento.CAJA;

    case MetodoPago.TRANSFERENCIA:
    case MetodoPago.CHEQUE:
    case MetodoPago.TARJETA:
      return CanalMovimiento.BANCO;

    case MetodoPago.CREDITO:
      throw new BadRequestException('CREDITO no soportado aún');
    case MetodoPago.OTRO:
    default:
      return CanalMovimiento.NINGUNO;
  }
};

const ingreso = (monto: number, canal: CanalMovimiento) => {
  switch (canal) {
    case CanalMovimiento.CAJA:
      return { deltaCaja: +monto, deltaBanco: 0 };
    case CanalMovimiento.BANCO:
      return { deltaCaja: 0, deltaBanco: +monto };
    default:
      return { deltaCaja: 0, deltaBanco: 0 };
  }
};

const egreso = (monto: number, canal: CanalMovimiento) => {
  switch (canal) {
    case CanalMovimiento.CAJA:
      return { deltaCaja: -monto, deltaBanco: 0 };
    case CanalMovimiento.BANCO:
      return { deltaCaja: 0, deltaBanco: -monto };
    default:
      return { deltaCaja: 0, deltaBanco: 0 };
  }
};

const efectivo = (monto: number) => ingreso(monto, CanalMovimiento.CAJA);

const banco = (monto: number) => ingreso(monto, CanalMovimiento.BANCO);

const egresoEfectivo = (monto: number) => egreso(monto, CanalMovimiento.CAJA);

const egresoBanco = (monto: number) => egreso(monto, CanalMovimiento.BANCO);

const MOTIVO_EFFECTS: Record<
  MotivoMovimiento,
  (ctx: MovementContext) => MovimientoEffects
> = {
  VENTA: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = ingreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.INGRESO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja !== 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  OTRO_INGRESO: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = ingreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.INGRESO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja !== 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  GASTO_OPERATIVO: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  COMPRA_MERCADERIA: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.COSTO_VENTA,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: true,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  COMPRA_INSUMOS: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.COSTO_VENTA,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: true,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  COSTO_ASOCIADO: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.COSTO_VENTA,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  DEPOSITO_CIERRE: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.TRANSFERENCIA,
    deltaCaja: -monto,
    deltaBanco: +monto,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: false,
    requiereRegistroCaja: true,
  }),

  DEPOSITO_PROVEEDOR: ({ monto }) => ({
    // clasificacion: ClasificacionAdmin.COSTO_VENTA,
    clasificacion: ClasificacionAdmin.COSTO_VENTA, // OK si así lo decidiste
    deltaCaja: -monto,
    deltaBanco: 0,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: false,
    requiereRegistroCaja: true,
  }),

  PAGO_PROVEEDOR_BANCO: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.COSTO_VENTA,
    deltaCaja: 0,
    deltaBanco: -monto,
    necesitaTurno: false,
    afectaInventario: false,
    requiereCuentaBancaria: true,
    requiereRegistroCaja: false,
  }),

  PAGO_PROVEEDOR_EFECTIVO: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.COSTO_VENTA,
    deltaCaja: -monto,
    deltaBanco: 0,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: false,
    requiereRegistroCaja: true,
  }),

  PAGO_CREDITO: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      // clasificacion: ClasificacionAdmin.COSTO_VENTA,
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  COBRO_CREDITO: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = ingreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.INGRESO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja !== 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  VENTA_CREDITO: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.INGRESO,
    deltaCaja: 0,
    deltaBanco: 0,
    necesitaTurno: false,
    afectaInventario: false,
    requiereCuentaBancaria: false,
    requiereRegistroCaja: false,
  }),

  BANCO_A_CAJA: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.TRANSFERENCIA,
    deltaCaja: +monto,
    deltaBanco: -monto,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: true,
    requiereRegistroCaja: true,
  }),

  CAJA_A_BANCO: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.TRANSFERENCIA,
    deltaCaja: -monto,
    deltaBanco: +monto,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: true,
    requiereRegistroCaja: true,
  }),

  ANTICIPO_CLIENTE: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = ingreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.INGRESO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja !== 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  ANTICIPO_PROVEEDOR: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.COSTO_VENTA,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  DEVOLUCION: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.CONTRAVENTA,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  DEVOLUCION_PROVEEDOR: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = ingreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.COSTO_VENTA,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja !== 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  AJUSTE_SOBRANTE: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.AJUSTE,
    deltaCaja: +monto,
    deltaBanco: 0,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: false,
    requiereRegistroCaja: true,
  }),

  AJUSTE_FALTANTE: ({ monto }) => ({
    clasificacion: ClasificacionAdmin.AJUSTE,
    deltaCaja: -monto,
    deltaBanco: 0,
    necesitaTurno: true,
    afectaInventario: false,
    requiereCuentaBancaria: false,
    requiereRegistroCaja: true,
  }),

  PAGO_NOMINA: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  PAGO_ALQUILER: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  PAGO_SERVICIOS: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  PAGO_IMPUESTOS: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  PAGO_COMISIONES: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },

  OTRO_EGRESO: ({ monto, metodoPago }) => {
    const canal = mapMetodoPagoToCanal(metodoPago);
    const mov = egreso(monto, canal);

    return {
      clasificacion: ClasificacionAdmin.GASTO_OPERATIVO,
      deltaCaja: mov.deltaCaja,
      deltaBanco: mov.deltaBanco,
      necesitaTurno: mov.deltaCaja < 0,
      afectaInventario: false,
      requiereCuentaBancaria: canal === CanalMovimiento.BANCO,
      requiereRegistroCaja: canal === CanalMovimiento.CAJA,
    };
  },
};

export function mapMotivoToEffects(dto: {
  motivo: MotivoMovimiento;
  metodoPago?: MetodoPago;
  monto: number;
}): MovimientoEffects {
  const resolver = MOTIVO_EFFECTS[dto.motivo];

  if (!resolver) {
    throw new BadRequestException('Motivo no soportado');
  }

  const effects = resolver({
    motivo: dto.motivo,
    metodoPago: dto.metodoPago,
    monto: Number(dto.monto),
  });

  return effects;
}
