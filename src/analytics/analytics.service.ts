import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateAnalyticsDto } from './dto/create-analytics.dto';
import { UpdateAnalyticsDto } from './dto/update-analytics.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { dayjs } from 'src/utils/dayjs';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary(idSucursal: number) {
    try {
      // Hacemos todas las llamadas en paralelo para mejorar rendimiento
      const [
        ventasMes,
        ventasSemana,
        ventasDia,
        ventasSemanalChart,
        masVendidos,
        ventasRecientes,
      ] = await Promise.all([
        this.getVentasMes(idSucursal),
        this.getTotalVentasMontoSemana(idSucursal),
        this.getVentasDiaII(idSucursal),
        this.getVentasSemanalChart(idSucursal),
        this.getProductosMasVendidos(),
        this.getVentasRecientes(),
      ]);

      return {
        ventasMes,
        ventasSemana,
        ventasDia,
        ventasSemanalChart,
        masVendidos,
        ventasRecientes,
      };
    } catch (error) {
      console.error('Error en getDashboardSummary:', error);
      throw new InternalServerErrorException('No se pudo cargar el dashboard');
    }
  }

  async getVendedorDashboardData(userId: number) {
    try {
    } catch (error) {
      this.logger.error('error generado es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal error: Error inesperado');
    }
  }

  async getTotalVentasMontoSemana(sucursalId: number) {
    try {
      const guatNow = dayjs().tz('America/Guatemala');

      const daysSinceMonday = (guatNow.day() + 6) % 7;
      const startLocal = guatNow
        .subtract(daysSinceMonday, 'day')
        .startOf('day');
      const endLocal = startLocal.add(6, 'day').endOf('day');

      const startUTC = startLocal.utc().toDate();
      const endUTC = endLocal.utc().toDate();

      const ventas = await this.prisma.venta.findMany({
        where: {
          sucursalId,
          fechaVenta: {
            gte: startUTC,
            lte: endUTC,
          },
        },
        select: { totalVenta: true },
      });

      return ventas.reduce((sum, { totalVenta }) => sum + totalVenta, 0);
    } catch (error) {
      console.error('Error al calcular monto semanal:', error);
      throw new InternalServerErrorException(
        'Error al calcular el monto total de ventas de la semana',
      );
    }
  }

  async getVentasSemanalChart(sucursalId: number) {
    try {
      const guatNow = dayjs().tz('America/Guatemala');
      const primerDiaSemana = guatNow.startOf('week');
      const ultimoDiaSemana = guatNow.endOf('week');

      const ventasPorDia = await this.prisma.venta.groupBy({
        by: ['fechaVenta'],
        where: {
          sucursalId: sucursalId,
          fechaVenta: {
            gte: primerDiaSemana.toDate(),
            lte: ultimoDiaSemana.toDate(),
          },
        },
        _sum: {
          totalVenta: true,
        },
        _count: {
          id: true,
        },
      });

      const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const ventasSemanal = diasSemana.map((dia, index) => {
        const fecha = primerDiaSemana.add(index, 'day');
        return {
          dia,
          totalVenta: 0,
          ventas: 0,
          fecha: fecha.toISOString(),
        };
      });

      ventasPorDia.forEach((venta) => {
        const fechaVenta = dayjs(venta.fechaVenta)
          .tz('America/Guatemala')
          .startOf('day');
        const diaIndex = fechaVenta.day() === 0 ? 6 : fechaVenta.day() - 1; // Lunes = 0, Domingo = 6

        if (ventasSemanal[diaIndex]) {
          ventasSemanal[diaIndex].totalVenta += venta._sum.totalVenta || 0;
          ventasSemanal[diaIndex].ventas += venta._count.id || 0;
        }
      });

      return ventasSemanal;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Error al calcular el monto total de ventas de la semana',
      );
    }
  }

  async getProductosMasVendidos() {
    try {
      // Consulta para obtener los 10 productos más vendidos en una sucursal específica
      const productosMasVendidos = await this.prisma.producto.findMany({
        include: {
          ventas: {
            select: {
              cantidad: true,
            },
          },
        },
      });

      // Calcular la suma total de ventas por producto
      const productosConTotalVentas = productosMasVendidos.map((producto) => {
        const totalVentas = producto.ventas.reduce(
          (total, venta) => total + venta.cantidad,
          0,
        );
        return {
          id: producto.id,
          nombre: producto.nombre,
          totalVentas,
        };
      });

      // Ordenar los productos por el total de ventas y tomar los 10 primeros
      const topProductos = productosConTotalVentas
        .sort((a, b) => b.totalVentas - a.totalVentas)
        .slice(0, 10);

      return topProductos;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Error al calcular los productos más vendidos',
      );
    }
  }

  async getVentasRecientes() {
    try {
      const ventasRecientes = await this.prisma.venta.findMany({
        take: 10,
        orderBy: {
          fechaVenta: 'desc',
        },
        select: {
          id: true,
          fechaVenta: true,
          totalVenta: true,
          sucursal: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      });

      return ventasRecientes;
    } catch (error) {
      console.log(error);
      throw new BadRequestException('Error al conseguir ventas recientes');
    }
  }

  //--------------------------------------------------

  async getVentasMes(idSucursal: number) {
    try {
      // 1. Grab “now” in Guatemala time
      const guatNow = dayjs().tz('America/Guatemala');
      // 2. Compute start/end of the LOCAL month
      const startOfMonth = guatNow.startOf('month').utc().toDate();
      const endOfMonth = guatNow.endOf('month').utc().toDate();

      // 3. Query between those UTC instants
      const ventasMes = await this.prisma.venta.findMany({
        where: {
          sucursalId: idSucursal,
          fechaVenta: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        orderBy: { fechaVenta: 'desc' },
        select: { totalVenta: true },
      });

      // 4. Sum up
      const totalVentasMes = ventasMes.reduce(
        (sum, v) => sum + v.totalVenta,
        0,
      );

      return totalVentasMes;
    } catch (error) {
      console.error('Error al encontrar los registros de venta:', error);
      throw new InternalServerErrorException(
        'Error al encontrar los registros de venta',
      );
    }
  }

  async getVentasDia(idSucursal: number, fecha?: string): Promise<number> {
    // Si no se pasa una fecha, usamos la fecha actual
    const fechaActual = fecha ? new Date(fecha) : new Date();

    // Eliminar la hora de la fecha seleccionada
    const inicioDia = new Date(
      fechaActual.getFullYear(),
      fechaActual.getMonth(),
      fechaActual.getDate(),
      0,
      0,
      0,
    );
    const finDia = new Date(
      fechaActual.getFullYear(),
      fechaActual.getMonth(),
      fechaActual.getDate(),
      23,
      59,
      59,
    );

    try {
      const ventasTotalMonto = await this.prisma.venta.aggregate({
        where: {
          sucursalId: idSucursal,
          fechaVenta: {
            gte: inicioDia, // Inicio del día
            lte: finDia, // Fin del día
          },
        },
        _sum: {
          totalVenta: true, // Sumar el total de ventas
        },
      });

      return ventasTotalMonto._sum.totalVenta || 0; // Si no hay ventas, retorna 0
    } catch (error) {
      console.error('Error al calcular las ventas del día:', error);
      throw new InternalServerErrorException(
        'Error al calcular el monto total de ventas del día',
      );
    }
  }

  async getVentasDiaII(idSucursal: number) {
    try {
      // Obtenemos la fecha de "hoy"
      const now = new Date();

      // Año, mes, día (en JavaScript, los meses arrancan en 0)
      const year = now.getFullYear();
      const month = now.getMonth();
      const day = now.getDate();

      // Construimos el rango de la medianoche hasta las 23:59:59
      const startOfDay = new Date(year, month, day, 0, 0, 0);
      const endOfDay = new Date(year, month, day, 23, 59, 59);

      // Buscamos todas las ventas hechas entre ese rango de fechas (independiente de la hora exacta)
      const ventasDeHoy = await this.prisma.venta.findMany({
        where: {
          sucursalId: idSucursal,
          fechaVenta: {
            gte: startOfDay, // >= 2 de ene, 2025 00:00:00
            lte: endOfDay, // <= 2 de ene, 2025 23:59:59
          },
        },
      });

      // Sumamos el total de ventas de este día
      const totalDeHoy = ventasDeHoy.reduce(
        (acc, venta) => acc + venta.totalVenta,
        0,
      );

      return totalDeHoy;
    } catch (error) {
      console.error('Error al obtener el total de ventas de hoy:', error);
      throw new InternalServerErrorException(
        'No se pudo obtener el total de ventas de hoy',
      );
    }
  }

  create(createAnalyticsDto: CreateAnalyticsDto) {
    return 'This action adds a new analytics';
  }

  findAll() {
    return `This action returns all analytics`;
  }

  findOne(id: number) {
    return `This action returns a #${id} analytics`;
  }

  update(id: number, updateAnalyticsDto: UpdateAnalyticsDto) {
    return `This action updates a #${id} analytics`;
  }

  remove(id: number) {
    return `This action removes a #${id} analytics`;
  }

  async getSucursalesSummary() {
    const sucursales = await this.prisma.sucursal.findMany({
      include: {
        saldosDiarios: true,
      },
    });

    return sucursales;
  }
}
