import { PresupuestoDetalleView } from '../interfaces/interfaces-view';

export function mapToDetalleView(record: any): PresupuestoDetalleView {
  return {
    id: record.id,
    montoAsignado: record.montoAsignado,
    montoComprometido: record.montoComprometido,
    montoEjercido: record.montoEjercido,
    montoDisponible: record.montoDisponible,

    // Usamos el operador ?. por si acaso algún objeto no viene
    periodo: {
      nombre: record.periodo?.nombre || 'N/A',
      fechaInicio: record.periodo?.fechaInicio || 'N/A',
      fechaFin: record.periodo?.fechaFin || 'N/A',
      estado: record.periodo?.estado,
    },
    centroCosto: {
      activo: record.centroCosto?.activo || true,
      codigo: record.centroCosto?.codigo || 'N/A',
      nombre: record.centroCosto?.nombre || 'N/A',
    },
    sucursal: record.centroCosto?.sucursal?.nombre || 'N/A',

    partida: {
      codigo: record.partida?.codigo || 'N/A',
      nombre: record.partida?.nombre || 'N/A',
      descripcion: record.partida?.descripcion || 'N/A',
    },

    // Si 'movimientos' es undefined, devolvemos un array vacío [] y no intentamos mapear
    historial:
      record.movimientos?.map((mov: any) => {
        let referencia = 'N/A';
        if (mov.requisicion) referencia = mov.requisicion.folio;
        if (mov.compra) referencia = mov.compra.folio || `OC-${mov.compra.id}`;

        return {
          id: mov.id,
          fecha: mov.fechaMovimiento,
          tipo: mov.tipoMovimiento,
          monto: mov.monto,
          descripcion: mov.descripcion,
          usuario: mov.usuario?.nombre || 'Sistema',
          referencia: referencia,
        };
      }) || [],
  };
}
