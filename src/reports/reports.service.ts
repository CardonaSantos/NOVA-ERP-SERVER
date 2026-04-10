import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { dayjs } from 'src/utils/dayjs';

import { PrismaService } from 'src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';

import { format } from 'date-fns';
// import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// import { utcToZonedTime } from "date-fns-tz";

const formatearFecha = (fecha) => {
  const zonaHoraria = 'America/Guatemala'; // Zona horaria de Guatemala
  const date = new Date(fecha);

  // Validar que la fecha es válida
  if (isNaN(date.getTime())) {
    throw new Error('Fecha inválida');
  }

  // Convertir la fecha UTC a la zona horaria de Guatemala
  const fechaLocal = toZonedTime(date, zonaHoraria);

  // Formatear la fecha local
  return format(fechaLocal, 'dd/MM/yyyy hh:mm a');
};

@Injectable()
export class ReportsService {
  //
  constructor(private readonly prisma: PrismaService) {}

  async generarExcelVentas(
    from?: string,
    to?: string,
    minTotal: number = 0,
    maxTotal: number = Infinity,
  ): Promise<Buffer> {
    console.log('Entrando al service de excel de ventas con los datos:');
    console.log({ from, to, minTotal, maxTotal });

    const whereConditions: any = {};
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    if (fromDate && toDate) {
      // Both dates provided: from start of 'from' day to end of 'to' day
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);
      whereConditions.fechaVenta = { gte: fromDate, lte: toDate };
    } else if (fromDate) {
      // Only 'from' provided: from the start of that day
      fromDate.setHours(0, 0, 0, 0);
      whereConditions.fechaVenta = { gte: fromDate };
    } else if (toDate) {
      // Only 'to' provided: filter exactly that day
      const startOfDay = new Date(toDate);
      startOfDay.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);
      whereConditions.fechaVenta = { gte: startOfDay, lte: toDate };
    }

    // 2. Lógica de MONTOS (evita errores si totalVenta no existe)
    whereConditions.totalVenta = {};
    if (minTotal > 0) {
      whereConditions.totalVenta.gte = minTotal;
    }
    if (maxTotal !== Infinity) {
      whereConditions.totalVenta.lte = maxTotal;
    }

    console.log('Condiciones de búsqueda:', whereConditions);

    // Obtener las ventas filtradas
    const ventas = await this.prisma.venta.findMany({
      where: whereConditions,
      include: {
        cliente: true,
        sucursal: true,
        metodoPago: { select: { metodoPago: true } },
        productos: { include: { producto: true } },
      },
    });

    // Crear el Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');

    // Configuración de columnas
    sheet.columns = [
      { header: 'ID Venta', key: 'id', width: 15 },
      { header: 'Fecha Venta', key: 'fechaVenta', width: 20 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Teléfono Cliente', key: 'telefonoCliente', width: 15 },
      { header: 'Dirección Cliente', key: 'direccionCliente', width: 30 },
      { header: 'Sucursal', key: 'sucursal', width: 25 },
      { header: 'Productos', key: 'productos', width: 50 },
      { header: 'Total Venta', key: 'totalVenta', width: 15 },
      { header: 'Método de Pago', key: 'metodoPago', width: 20 },
    ];

    // Rellenar filas con datos
    ventas.forEach((venta) => {
      const productosFormatted = venta.productos
        .map(
          (prod) =>
            `${prod.cantidad}x ${prod.producto?.nombre || 'Producto desconocido'} (Q${prod.precioVenta.toFixed(
              2,
            )})`,
        )
        .join('\n');

      sheet.addRow({
        id: venta.id,
        fechaVenta: formatearFecha(venta.fechaVenta.toISOString()),
        cliente: venta.cliente?.nombre || venta.nombreClienteFinal || 'CF',
        telefonoCliente:
          venta.cliente?.telefono || venta.telefonoClienteFinal || 'N/A',
        direccionCliente:
          venta.cliente?.direccion || venta.direccionClienteFinal || 'N/A',
        sucursal: venta.sucursal?.nombre || 'N/A',
        productos: productosFormatted,
        totalVenta: `Q${venta.totalVenta.toFixed(2)}`,
        metodoPago: venta.metodoPago?.metodoPago || 'N/A',
      });
    });

    // Aplicar estilos a las celdas
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'left',
          wrapText: true,
        };
      });
    });

    // Exportar a Buffer
    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  async generarCreditosReport(from?: string, to?: string): Promise<Buffer> {
    try {
      console.log('Generando reporte de créditos...', { from, to });

      // Configurar filtros de fechas
      const whereConditions: any = {};
      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? new Date(to) : undefined;

      if (fromDate && toDate) {
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);
        whereConditions.creadoEn = { gte: fromDate, lte: toDate };
      } else if (fromDate) {
        fromDate.setHours(0, 0, 0, 0);
        whereConditions.creadoEn = { gte: fromDate };
      } else if (toDate) {
        const startOfDay = new Date(toDate);
        startOfDay.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);
        whereConditions.creadoEn = { gte: startOfDay, lte: toDate };
      }

      console.log('Condiciones de búsqueda:', whereConditions);

      // Obtener los créditos filtrados
      const creditos = await this.prisma.ventaCuota.findMany({
        where: whereConditions,
        include: {
          cliente: { select: { nombre: true, telefono: true } },
          cuotas: { select: { id: true, monto: true, creadoEn: true } },
          venta: {
            select: {
              id: true,
              productos: {
                select: {
                  cantidad: true,
                  producto: true,
                  id: true,
                  precioVenta: true,
                },
              },
            },
          },
        },
      });

      console.log('Los creditos son: ', creditos);

      // Crear el archivo Excel
      const workbook = new ExcelJS.Workbook();
      const creditosSheet = workbook.addWorksheet('CRÉDITOS');
      const totalesSheet = workbook.addWorksheet('TOTALES');

      const morososSheet = workbook.addWorksheet('MOROSOS');

      // Encuentra el máximo de cuotasTotales
      const maxCuotasTotales = Math.max(
        ...creditos.map((c) => c.cuotasTotales),
      );

      const paymentColumns = [];
      for (let i = 1; i <= maxCuotasTotales; i++) {
        paymentColumns.push(
          {
            header: `Pago ${i} Fecha`,
            key: `pago${i}FechaEsperada`,
            width: 20,
          },

          { header: `Pago ${i} Monto`, key: `pago${i}Monto`, width: 15 },
        );
      }
      // Configuración de columnas de creditos activos
      creditosSheet.columns = [
        // { header: 'ID Crédito', key: 'id', width: 15 },
        { header: 'CREDITO', key: 'credito', width: 15 },
        { header: 'CLIENTE', key: 'cliente', width: 30 },
        { header: 'TELEFONO', key: 'telefono', width: 15 }, // Corrección aquí
        { header: 'ESTADO', key: 'estado', width: 15 }, // Corrección aquí
        { header: 'FECHA VENTA', key: 'fechaInicio', width: 20 },
        { header: 'PRODUCTO', key: 'producto', width: 20 },
        {
          header: 'MONTO TOTAL CON INTERES',
          key: 'montoConInteres',
          width: 30,
        },

        {
          header: 'PAGADO',
          key: 'pagado',
          width: 20,
        },

        {
          header: 'INTERES',
          key: 'interes',
          width: 20,
        },

        {
          header: 'ENGANCHE',
          key: 'pagoInicial',
          width: 20,
        },

        {
          header: 'DIAS ENTRE PAGOS', //solo de muestra para que veas
          key: 'diasEntrePagos',
          width: 20,
        },
        ...paymentColumns,
      ];

      totalesSheet.columns = [
        {
          header: 'OTORGADOS', //solo de muestra para que veas
          key: 'otorgados',
          width: 20,
        },
        {
          header: 'RECUPERADOS', //solo de muestra para que veas
          key: 'recuperados',
          width: 20,
        },
        {
          header: 'POR RECUPERAR', //solo de muestra para que veas
          key: 'porRecuperar',
          width: 20,
        },
      ];

      // Configuración de columnas de MOROSOS
      morososSheet.columns = [
        { header: 'CLIENTE', key: 'cliente', width: 15 },
        { header: 'TELEFONO', key: 'telefono', width: 15 },
        { header: 'ESTADO', key: 'estado', width: 15 },
        { header: 'FECHA VENTA', key: 'fechaVenta', width: 20 },
        { header: 'PRODUCTO', key: 'producto', width: 20 },
        { header: 'MONTO CON INTERÉS', key: 'montoConInteres', width: 20 },
        { header: 'ENGANCHE', key: 'enganche', width: 20 },
        { header: 'POR RECUPERAR', key: 'porRecuperar', width: 20 },
      ];

      // Aplicar estilo a la primera fila (encabezados)
      const headerRowMorosos = morososSheet.getRow(1);
      headerRowMorosos.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD3D3D3' }, // Color gris claro
        };
        cell.font = {
          bold: true,
          color: { argb: 'FF000000' }, // Color negro texto
        };
      });

      const headerTotales = totalesSheet.getRow(1);
      // Pinta cada columna con un color diferente
      headerTotales.getCell('otorgados').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'f5a002' }, // Rojo-naranja
      };

      headerTotales.getCell('recuperados').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '00cc14' }, // Verde
      };

      headerTotales.getCell('porRecuperar').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '5200cc' }, // Azul
      };

      // Aplica negrita a todas las celdas
      headerTotales.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } }; // Blanco
      });

      // Colores personalizados para encabezados generales
      const generalHeaderColors = [
        '1F497D', // Azul oscuro
        '8403FC', // Naranja
        '4F81BD', // Azul claro
        'f70777', //NUEVO COLOR
        '228B22', // Verde
        '8E44AD', // Morado
        'D35400', // Rojo oscuro
        '2C3E50', // Azul grisáceo
        '16A085', // Verde azulado
        'C0392B', // Rojo intenso
      ];

      const paymentDateColor = '4a08bd'; // Verde para fechas de pago
      const paymentAmountColor = 'f70254'; // Naranja para montos de pago

      // Aplicar colores a cada celda de la primera fila
      const headerRow = creditosSheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const cellValue = cell.value?.toString() || '';

        let color: string;

        if (cellValue.includes('Pago') && cellValue.includes('Fecha')) {
          color = paymentDateColor; // Verde para "Pago X Fecha"
        } else if (cellValue.includes('Pago') && cellValue.includes('Monto')) {
          color = paymentAmountColor; // Naranja para "Pago X Monto"
        } else {
          color =
            generalHeaderColors[(colNumber - 1) % generalHeaderColors.length]; // Rotar en la paleta general
        }

        // Aplicar estilos
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // Texto blanco
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // Rellenar filas con datos de la primer hoja de creditos activos
      creditos
        .filter(
          (credito) =>
            credito.totalPagado < credito.montoTotalConInteres &&
            credito.estado == 'ACTIVA',
        )
        .forEach((credito) => {
          const rowData = {
            id: credito.id,
            credito: `CREDITO-00${credito.id}`,
            cliente: credito.cliente?.nombre || 'Sin cliente',
            telefono: credito.cliente?.telefono || 'N/A',
            estado: credito.estado || 'N/A',
            fechaInicio: formatearFecha(credito.fechaInicio.toISOString()),
            producto: credito.venta.productos
              .map((prod) => `${prod.producto.nombre} (${prod.cantidad})`)
              .join(', '), // Corregido: usa map + join
            montoConInteres: credito.montoTotalConInteres,
            pagado: credito.totalPagado,
            interes: credito.interes,
            pagoInicial: credito.cuotaInicial,
            diasEntrePagos: credito.diasEntrePagos,
          };

          for (let i = 0; i < credito.cuotasTotales; i++) {
            const numeroPago = i + 1;

            let diaInicio = dayjs(credito?.fechaInicio);

            // const fechaEsperada = diaInicio.add(credito.diasEntrePagos, 'day');

            const fechaEsperada = diaInicio.add(
              credito.diasEntrePagos * (i + 1),
              'day',
            ); // 👈 (i+1) aquí

            diaInicio = fechaEsperada;
            rowData[`pago${numeroPago}FechaEsperada`] = formatearFecha(
              fechaEsperada.toISOString(),
            );

            // Busca la cuota correspondiente (asumiendo que están en orden)
            const cuota = credito.cuotas[i];
            if (cuota) {
              rowData[`pago${numeroPago}FechaReal`] = formatearFecha(
                cuota.creadoEn.toISOString(),
              );
              rowData[`pago${numeroPago}Monto`] = cuota.monto;
            } else {
              // rowData[`pago${numeroPago}FechaReal`] = 'Pendiente';
              rowData[`pago${numeroPago}Monto`] = 'Pendiente';
            }
          }

          creditosSheet.addRow(rowData);
        });

      let totalesCreditos = creditos.filter(
        (credit) => (credit.estado = 'ACTIVA'),
      );
      const totalOtorgados = totalesCreditos.reduce(
        (acc, credito) => acc + credito.montoTotalConInteres,
        0,
      );

      const totalRecuperados = totalesCreditos.reduce(
        (acc, credito) => acc + credito.totalPagado,
        0,
      );

      const totalPorRecuperar = totalOtorgados - totalRecuperados;

      // Solo agregamos una fila con los totales
      totalesSheet.addRow({
        otorgados: totalOtorgados,
        recuperados: totalRecuperados,
        porRecuperar: totalPorRecuperar,
      });

      // OTROS
      // Filtrar créditos morosos
      creditos
        .filter((credito) => {
          // Si ya pagó todo, no es moroso
          if (credito.totalPagado >= credito.montoTotalConInteres) return false;

          // Calcular cuántas cuotas deberían haberse pagado hasta hoy
          const hoy = dayjs();
          const fechaInicio = dayjs(credito.fechaInicio);

          // Número de cuotas que deberían estar pagadas según el tiempo transcurrido
          const diasTranscurridos = hoy.diff(fechaInicio, 'day');
          const cuotasDebidas = Math.floor(
            diasTranscurridos / credito.diasEntrePagos,
          );

          // Verificar si hay cuotas impagas dentro de las debidas
          const cuotasImpagas = credito.cuotas
            .slice(0, cuotasDebidas)
            .some((cuota, index) => {
              const numeroCuota = index + 1;
              const fechaEsperada = fechaInicio.add(
                credito.diasEntrePagos * numeroCuota,
                'day',
              );

              // Si no existe la cuota o fue pagada después de lo esperado
              return !cuota || dayjs(cuota.creadoEn).isAfter(fechaEsperada);
            });

          return cuotasImpagas;
        })

        .forEach((credito) => {
          morososSheet.addRow({
            cliente: credito.cliente.nombre,
            telefono: credito.cliente.telefono,
            estado: credito.estado,
            fechaVenta: credito.fechaInicio,
            producto: credito.venta.productos
              .map(
                (producto) =>
                  `${producto.producto.nombre} (${producto.cantidad})`,
              )
              .join(', '),
            montoConInteres: credito.montoTotalConInteres,
            enganche: credito.cuotaInicial,
            porRecuperar: credito.montoTotalConInteres - credito.totalPagado,
          });
        });

      const uint8Array = await workbook.xlsx.writeBuffer();
      return Buffer.from(uint8Array);
    } catch (error) {
      console.error('Error al generar reporte de créditos:', error);
      throw new Error('Hubo un problema generando el reporte de créditos.');
    }
  }

  async generarMetasReport(from?: string, to?: string): Promise<Buffer> {
    try {
      console.log('Generando reporte de metas...', { from, to });

      const today = dayjs();
      const thisDay = today.date();
      const totalDiasMes = today.daysInMonth();

      // Configurar filtros de fechas
      const whereConditions: any = {
        estado: {
          notIn: ['CANCELADO', 'CERRADO'],
        },
      };
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        whereConditions.creadoEn = { gte: fromDate };
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        whereConditions.creadoEn = {
          ...(whereConditions.creadoEn || {}),
          lte: toDate,
        };
      }

      const [metas, metasCobros] = await Promise.all([
        this.prisma.metaUsuario.findMany({
          where: whereConditions,

          include: { usuario: { select: { nombre: true } } },
        }),
        this.prisma.metaCobros.findMany({
          where: whereConditions,
          include: { usuario: { select: { nombre: true } } },
        }),
      ]);

      console.log('Las metas son: ', metas);

      const workbook = new ExcelJS.Workbook();
      const metasSheet = workbook.addWorksheet('Metas Tienda');
      const metasCobroSheet = workbook.addWorksheet('Metas Cobro');

      const columns = [
        { header: 'ID', key: 'id', width: 7 },
        { header: 'Fecha Inicio', key: 'fechaInicio', width: 20 },
        { header: 'Titulo', key: 'tituloMeta', width: 25 },
        { header: 'Usuario', key: 'usuario', width: 25 },
        { header: 'Monto Meta', key: 'montoMeta', width: 15 },
        { header: 'Monto Actual', key: 'montoActual', width: 15 },
        { header: 'Faltante', key: 'faltante', width: 15 },
        { header: 'Porcentaje', key: 'porcentaje', width: 15 },
        { header: 'Referencia', key: 'referencia', width: 15 },
        { header: 'Diferencia', key: 'diferencia', width: 15 },
        { header: 'Estado', key: 'estado', width: 15 },
      ];

      metasSheet.columns = columns;
      metasCobroSheet.columns = columns;

      // Aplicar colores por columna
      const columnColors = [
        'CCCCCC', // ID
        '99CCFF', // Fecha Inicio
        'FFCC99', // Titulo
        'FF9966', // Usuario
        'FFFF99', // Monto Meta
        '99FF99', // Monto Actual
        'FF9999', // Faltante
        '66CCFF', // Porcentaje
        'CC99FF', // Referencia
        'FF66CC', // Diferencia
        '99FFFF', // Estado
      ];

      const applyHeaderStyle = (sheet) => {
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: columnColors[colNumber - 1] },
          };
          cell.font = { bold: true, color: { argb: '000000' } };
          cell.alignment = { horizontal: 'center' };
        });
      };

      applyHeaderStyle(metasSheet);
      applyHeaderStyle(metasCobroSheet);

      metas.forEach((meta) => {
        const porcentaje =
          meta.montoMeta > 0 ? (meta.montoActual / meta.montoMeta) * 100 : 0;
        const referencia = (thisDay / totalDiasMes) * 100;
        const diferencia = porcentaje - referencia;

        metasSheet.addRow({
          id: meta.id,
          fechaInicio: formatearFecha(meta.fechaInicio),
          tituloMeta: meta.tituloMeta,
          usuario: meta.usuario.nombre,
          montoMeta: meta.montoMeta,
          montoActual: meta.montoActual,
          faltante: meta.montoMeta - meta.montoActual,
          porcentaje: `${porcentaje.toFixed(2)}%`,
          referencia: `${referencia.toFixed(2)}%`,
          diferencia: `${diferencia.toFixed(2)}%`,
          estado: meta.estado,
        });
      });

      metasCobros.forEach((meta) => {
        const porcentaje =
          meta.montoMeta > 0 ? (meta.montoActual / meta.montoMeta) * 100 : 0;
        const referencia = (thisDay / totalDiasMes) * 100;
        const diferencia = porcentaje - referencia;

        metasCobroSheet.addRow({
          id: meta.id,
          fechaInicio: formatearFecha(meta.fechaInicio),
          tituloMeta: meta.tituloMeta,
          usuario: meta.usuario.nombre,
          montoMeta: meta.montoMeta,
          montoActual: meta.montoActual,
          faltante: meta.montoMeta - meta.montoActual,
          porcentaje: `${porcentaje.toFixed(2)}%`,
          referencia: `${referencia.toFixed(2)}%`,
          diferencia: `${diferencia.toFixed(2)}%`,
          estado: meta.estado,
        });
      });
      const uint8Array = await workbook.xlsx.writeBuffer();
      return Buffer.from(uint8Array);
    } catch (error) {
      console.error('Error al generar reporte de metas:', error);
      throw new Error('Hubo un problema generando el reporte de metas.');
    }
  }
}
