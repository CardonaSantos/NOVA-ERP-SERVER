import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UpdateRecepcionRequisicioneDto } from './dto/update-recepcion-requisicione.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateRequisicionRecepcionDto,
  CreateRequisicionRecepcionLineaDto,
} from './dto/requisicion-recepcion-create.dto';
import { UtilitiesService } from 'src/utilities/utilities.service';
import { dayjs } from 'src/utils/dayjs';
import { HistorialStockTracker } from 'src/historial-stock-tracker/entities/historial-stock-tracker.entity';
import { HistorialStockTrackerService } from 'src/historial-stock-tracker/historial-stock-tracker.service';
import { TypeOperationStockTracker } from 'src/historial-stock-tracker/utils';
import { EntregaStockData } from 'src/utilities/utils';
import { TipoMovimientoStock } from '@prisma/client';

@Injectable()
export class RecepcionRequisicionesService {
  private readonly logger = new Logger(RecepcionRequisicionesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly utilities: UtilitiesService,
    private readonly tracker: HistorialStockTrackerService,
  ) {}

  async makeRecepcionRequisicion(dto: CreateRequisicionRecepcionDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const requisicionMain = await tx.requisicion.findUnique({
          where: { id: dto.requisicionId },
        });

        if (!requisicionMain) {
          throw new NotFoundException({
            message: 'Error al encontrar el registro de requisición',
          });
        }

        const newRequisicionRecepcion = await tx.requisicionRecepcion.create({
          data: {
            observaciones: dto.observaciones,
            usuario: { connect: { id: dto.usuarioId } },
            requisicion: { connect: { id: dto.requisicionId } },
          },
        });

        const lineas = await Promise.all(
          dto.lineas.map((prod) =>
            tx.requisicionRecepcionLinea.create({
              data: {
                requisicionRecepcion: {
                  connect: { id: newRequisicionRecepcion.id },
                },
                requisicionLinea: { connect: { id: prod.requisicionLineaId } },
                producto: { connect: { id: prod.productoId } },
                cantidadSolicitada: prod.cantidadSolicitada,
                cantidadRecibida: prod.cantidadRecibida,
                ingresadaAStock: prod.ingresadaAStock ?? true,
              },
            }),
          ),
        );

        await Promise.all(
          dto.lineas.map((prod) =>
            tx.requisicionLinea.update({
              where: { id: prod.requisicionLineaId },
              data: {
                cantidadRecibida: prod.cantidadRecibida,
                ingresadaAStock: true,
              },
            }),
          ),
        );

        const stockDtos = dto.lineas.map((linea) => ({
          productoId: linea.productoId,
          cantidad: linea.cantidadRecibida,
          costoTotal: (linea.precioUnitario ?? 0) * linea.cantidadRecibida,
          fechaIngreso: new Date().toISOString(),
          fechaExpiracion: linea?.fechaExpiracion ?? null,
          precioCosto: linea.precioUnitario ?? 0,
          sucursalId: requisicionMain.sucursalId,
          requisicionRecepcionId: newRequisicionRecepcion.id,
        }));

        const totalEntrega = dto.lineas.reduce(
          (accumulador: number, linea: CreateRequisicionRecepcionLineaDto) =>
            accumulador + (linea.precioUnitario ?? 0) * linea.cantidadRecibida,
          0,
        );

        let entregaStockData: EntregaStockData = {
          fechaEntrega: dayjs().tz('America/Guatemala').toDate(),
          montoTotal: totalEntrega,
          proveedorId: dto.proveedorId,
          sucursalId: dto.sucursalId,
          recibidoPorId: dto.usuarioId,
        };

        await this.tracker.trackIngresoProductos(
          tx,
          dto.lineas,
          dto.sucursalId,
          dto.usuarioId,
          dto.requisicionId,
          TipoMovimientoStock.INGRESO_REQUISICION,
          'Este comentario surge dentro de la funcion main',
        );

        const newStocks = await this.utilities.generateStockFromRequisicion(
          tx,
          stockDtos,
          entregaStockData,
        );

        if (newStocks && lineas) {
          await tx.requisicion.update({
            where: {
              id: requisicionMain.id,
            },
            data: {
              fechaRecepcion: dayjs().tz('America/Guatemala').toDate(),
              ingresadaAStock: true,
              estado: 'RECIBIDA',
            },
          });
        }

        return { newRequisicionRecepcion, lineas, newStocks };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('El error es: ', error);
      throw new InternalServerErrorException({
        message: 'Fatal error: Error inesperado',
      });
    }
  }

  async receiveProductFromRequisicion() {}

  findAll() {
    return `This action returns all recepcionRequisiciones`;
  }

  findOne(id: number) {
    return `This action returns a #${id} recepcionRequisicione`;
  }

  update(
    id: number,
    updateRecepcionRequisicioneDto: UpdateRecepcionRequisicioneDto,
  ) {
    return `This action updates a #${id} recepcionRequisicione`;
  }

  remove(id: number) {
    return `This action removes a #${id} recepcionRequisicione`;
  }
}
