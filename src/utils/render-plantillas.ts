import { Logger } from '@nestjs/common';
import { formattFechaWithMinutes, formattShortFecha } from './formattFecha';

function siNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

export function buildVentaCuotaVariables(params: {
  sucursal: any;
  ventaCuota: any;
}) {
  const { sucursal, ventaCuota } = params;
  const cliente = ventaCuota.cliente;
  const cuotas = ventaCuota.cuotas ?? [];
  const abonos = ventaCuota.abonos ?? [];
  const venta = ventaCuota.venta;
  const testigos: { nombre?: string; dpi?: string }[] = Array.isArray(
    ventaCuota.testigos,
  )
    ? ventaCuota.testigos
    : [];

  // ── Cuotas ──────────────────────────────────────────────────────────────
  const cuotasPagadas = cuotas.filter((c) => c.estado === 'PAGADA').length;
  const cuotasPendientes = cuotas.filter(
    (c) => c.estado === 'PENDIENTE',
  ).length;
  const cuotasAtrasadas = cuotas.filter((c) => c.estado === 'ATRASADA').length;
  const cuotasVencidas = cuotas.filter(
    (c) => c.estado === 'VENCIDA' || c.estado === 'ATRASADA',
  ).length;
  const moraAcumulada = cuotas.reduce(
    (acc, c) => acc + Number(c.moraAcumulada ?? 0),
    0,
  );
  const saldoPendiente = cuotas.reduce((acc, c) => {
    const saldo =
      c.saldoPendiente !== null
        ? Number(c.saldoPendiente)
        : Number(c.monto) - Number(c.montoPagado ?? 0);
    return acc + saldo;
  }, 0);
  const montoPorCuota = cuotas[0]?.monto ?? 0;

  // ── Abonos ───────────────────────────────────────────────────────────────
  const totalPagado = abonos.reduce(
    (acc, a) => acc + Number(a.montoTotal ?? 0),
    0,
  );
  const ultimoAbono = abonos.at(-1);

  // ── Venta / Productos ────────────────────────────────────────────────────
  const productos = venta?.productos ?? [];
  const productosTexto = productos
    .map(
      (p) =>
        `${p.producto?.nombre ?? 'Producto'} x${p.cantidad} @ Q${p.precioVenta}`,
    )
    .join(', ');

  // ── Testigos ─────────────────────────────────────────────────────────────
  const testigo1 = testigos[0] ?? {};
  const testigo2 = testigos[1] ?? {};

  return {
    // CLIENTE
    'cliente.id': String(cliente?.id ?? ''),
    'cliente.nombre': cliente?.nombre ?? '',
    'cliente.apellidos': cliente?.apellidos ?? '',
    'cliente.nombreCompleto':
      `${cliente?.nombre ?? ''} ${cliente?.apellidos ?? ''}`.trim(),
    'cliente.dpi': cliente?.dpi ?? '',
    'cliente.nit': cliente?.nit ?? '',
    'cliente.telefono': cliente?.telefono ?? '',
    'cliente.direccion': cliente?.direccion ?? '',
    'cliente.municipio': cliente?.municipio?.nombre ?? '',
    'cliente.departamento': cliente?.departamento?.nombre ?? '',

    // CRÉDITO
    'credito.id': String(ventaCuota.id),
    'credito.numeroCredito': ventaCuota.numeroCredito ?? `VC-${ventaCuota.id}`,
    'credito.totalVenta': String(ventaCuota.totalVenta ?? 0),
    'credito.montoVenta': String(ventaCuota.montoVenta ?? 0),
    'credito.montoTotalConInteres': String(
      ventaCuota.montoTotalConInteres ?? 0,
    ),
    'credito.cuotaInicial': String(ventaCuota.cuotaInicial ?? 0),
    'credito.cuotasTotales': String(ventaCuota.cuotasTotales ?? 0),
    'credito.interes': String(ventaCuota.interes ?? 0),
    'credito.moraDiaria': String(ventaCuota.moraDiaria ?? 0),
    'credito.diasEntrePagos': String(ventaCuota.diasEntrePagos ?? 0),
    'credito.diasGracia': String(ventaCuota.diasGracia ?? 0),
    'credito.frecuenciaPago': ventaCuota.frecuenciaPago ?? '',
    'credito.interesTipo': ventaCuota.interesTipo ?? '',
    'credito.planCuotaModo': ventaCuota.planCuotaModo ?? '',
    'credito.estado': ventaCuota.estado ?? '',
    'credito.garantiaMeses': String(ventaCuota.garantiaMeses ?? 0),
    'credito.comentario': ventaCuota.comentario ?? '',
    'credito.dpi': ventaCuota.dpi ?? '',
    'credito.fechaInicio': formattShortFecha(ventaCuota.fechaInicio),
    'credito.fechaContrato': formattShortFecha(ventaCuota.fechaContrato),
    'credito.fechaProximoPago': ventaCuota.fechaProximoPago
      ? formattShortFecha(ventaCuota.fechaProximoPago)
      : '',
    'credito.creadoEn': formattFechaWithMinutes(ventaCuota.creadoEn),

    // CUOTAS
    'cuotas.total': String(cuotas.length),
    'cuotas.pagadas': String(cuotasPagadas),
    'cuotas.pendientes': String(cuotasPendientes),
    'cuotas.atrasadas': String(cuotasAtrasadas),
    'cuotas.vencidas': String(cuotasVencidas),
    'cuotas.montoPorCuota': String(montoPorCuota),
    'cuotas.moraAcumulada': moraAcumulada.toFixed(2),
    'cuotas.totalPagado': totalPagado.toFixed(2),
    'cuotas.saldoPendiente': saldoPendiente.toFixed(2),

    // ABONOS / PAGOS
    'pagos.totalPagado': totalPagado.toFixed(2),
    'pagos.numeroPagos': String(abonos.length),
    'pagos.fechaUltimoPago': ultimoAbono?.fechaAbono
      ? formattFechaWithMinutes(ultimoAbono.fechaAbono)
      : '',

    // MORA
    'mora.tieneMora': siNo(moraAcumulada > 0),
    'mora.montoTotal': moraAcumulada.toFixed(2),

    // VENTA / PRODUCTOS
    'venta.id': venta ? String(venta.id) : '',
    'venta.totalVenta': venta ? String(venta.totalVenta) : '',
    'venta.fechaVenta': venta?.fechaVenta
      ? formattShortFecha(venta.fechaVenta)
      : '',
    'venta.metodoPago': venta?.metodoPago?.metodoPago ?? '',
    'venta.productos': productosTexto,

    // TESTIGOS
    'testigo1.nombre': testigo1.nombre ?? '',
    'testigo1.dpi': testigo1.dpi ?? '',
    'testigo2.nombre': testigo2.nombre ?? '',
    'testigo2.dpi': testigo2.dpi ?? '',

    // SUCURSAL
    'sucursal.id': String(sucursal?.id ?? ''),
    'sucursal.nombre': sucursal?.nombre ?? '',
    'sucursal.direccion': sucursal?.direccion ?? '',
    'sucursal.telefono': sucursal?.telefono ?? '',

    // VENDEDOR
    'vendedor.id': String(ventaCuota.usuario?.id ?? ''),
    'vendedor.nombre': ventaCuota.usuario?.nombre ?? '',
    'vendedor.telefono': ventaCuota.usuario?.telefono ?? '',

    // FLAGS
    'flags.tieneMora': siNo(moraAcumulada > 0),
    'flags.creditoActivo': siNo(ventaCuota.estado === 'ACTIVA'),
    'flags.tieneEnganche': siNo(Number(ventaCuota.cuotaInicial ?? 0) > 0),

    // SISTEMA
    'sistema.fechaHoy': formattShortFecha(new Date()),
    'sistema.horaHoy': new Date().toLocaleTimeString('es-GT', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    'sistema.fechaHoyLargo': new Date().toLocaleDateString('es-GT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}
export function renderPlantilla(
  template: string,
  variables: Record<string, any>,
): string {
  return template.replace(/{{\s*([\s\S]*?)\s*}}/g, (match, contentInside) => {
    const cleanKey = contentInside.replace(/<[^>]*>?/gm, '').trim();
    const value = variables[cleanKey];
    if (value !== undefined && value !== null) return String(value);
    return match;
  });
}
