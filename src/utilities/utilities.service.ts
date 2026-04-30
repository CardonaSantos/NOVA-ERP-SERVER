import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateUtilityDto } from './dto/create-utility.dto';
import { UpdateUtilityDto } from './dto/update-utility.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { EstadoTurnoCaja, Prisma } from '@prisma/client';
import { GenerateStockDto } from './dto/generate-stock.dto';
import { EntregaStockData } from './utils';
import { StockPresentacionDto } from 'src/compras-requisiciones/interfaces';

export type GenerateStockPresentacionDto = {
  productoId: number;
  presentacionId: number;
  sucursalId: number;
  cantidadPresentacion: number;
  fechaIngreso: Date;
  fechaVencimiento?: Date | null;
  requisicionRecepcionId?: number;
  precioCosto: number;
  costoTotal: number;
};

@Injectable()
export class UtilitiesService {
  private readonly logger = new Logger(UtilitiesService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateStockFromRequisicion(
    tx: Prisma.TransactionClient,
    dtos: GenerateStockDto[],
    entregaStockData?: EntregaStockData,
  ) {
    this.logger.log('El dto entrando a generar el stock es: ', dtos);

    let entregaStock;

    if (entregaStockData) {
      entregaStock = await tx.entregaStock.create({
        data: {
          proveedor: {
            connect: {
              id: entregaStockData.proveedorId,
            },
          },
          montoTotal: entregaStockData.montoTotal,
          fechaEntrega: entregaStockData.fechaEntrega ?? new Date(),
          usuarioRecibido: {
            connect: {
              id: entregaStockData.recibidoPorId,
            },
          },
          sucursal: {
            connect: {
              id: entregaStockData.sucursalId,
            },
          },
        },
      });
    }

    const newStocksCreated = await Promise.all(
      dtos.map((prod) =>
        tx.stock.create({
          data: {
            cantidad: prod.cantidad,
            cantidadInicial: prod.cantidad,
            costoTotal: prod.costoTotal,
            fechaIngreso: prod.fechaIngreso,
            fechaVencimiento: prod?.fechaExpiracion,
            precioCosto: prod.precioCosto,
            sucursal: { connect: { id: prod.sucursalId } },
            producto: { connect: { id: prod.productoId } },
            entregaStock: entregaStock
              ? { connect: { id: entregaStock.id } }
              : undefined,
            requisicionRecepcion: prod.requisicionRecepcionId
              ? { connect: { id: prod.requisicionRecepcionId } }
              : undefined,
          },
        }),
      ),
    );

    if (!newStocksCreated || newStocksCreated.length === 0) {
      throw new InternalServerErrorException({
        message: 'No se pudieron registrar los stocks',
      });
    }

    this.logger.debug('El nuevo registro de stock es: ', newStocksCreated);
    return { newStocksCreated, entregaStock }; // Retorna ambos registros
  }

  //crear stock de presentaciones
  async generateStockPresentacion(
    tx: Prisma.TransactionClient,
    dtos: GenerateStockPresentacionDto[],
  ) {
    this.logger.log('DTOS StockPresentacion -> ', dtos);
    if (!dtos.length) return { created: [], totalCosto: 0, totalCantidad: 0 };

    // Validaciones mínimas (evita bases 0 en prorrateo VALOR)
    for (const d of dtos) {
      if (!(d.cantidadPresentacion > 0)) {
        throw new BadRequestException('cantidadPresentacion debe ser > 0');
      }
      if (!(d.costoTotal > 0) || !(d.precioCosto > 0)) {
        const precio = d.precioCosto || d.costoTotal / d.cantidadPresentacion;
        const total = d.costoTotal || precio * d.cantidadPresentacion;
        d.precioCosto = Number(precio.toFixed(4));
        d.costoTotal = Number(total.toFixed(4));
      }
    }

    const created = await Promise.all(
      dtos.map((sp) =>
        tx.stockPresentacion.create({
          data: {
            producto: { connect: { id: sp.productoId } },
            presentacion: { connect: { id: sp.presentacionId } },
            sucursal: { connect: { id: sp.sucursalId } },
            cantidadPresentacion: sp.cantidadPresentacion,
            cantidadRecibidaInicial: sp.cantidadPresentacion,
            fechaIngreso: sp.fechaIngreso,
            fechaVencimiento: sp.fechaVencimiento ?? null,
            requisicionRecepcion: sp.requisicionRecepcionId
              ? { connect: { id: sp.requisicionRecepcionId } }
              : undefined,
            precioCosto: sp.precioCosto,
            costoTotal: sp.costoTotal,
          },
          select: {
            id: true,
            productoId: true,
            presentacionId: true,
            cantidadPresentacion: true,
            precioCosto: true,
            costoTotal: true,
          },
        }),
      ),
    );

    if (!created.length) {
      throw new InternalServerErrorException(
        'No se pudieron registrar presentaciones',
      );
    }

    const totalCosto = created.reduce(
      (acc, x) => acc + Number(x.costoTotal ?? 0),
      0,
    );
    const totalCantidad = created.reduce(
      (acc, x) => acc + Number(x.cantidadPresentacion ?? 0),
      0,
    );

    return { created, totalCosto, totalCantidad };
  }

  // Dentro de tu servicio de Caja
  async getCajaEstado(tx: Prisma.TransactionClient, registroCajaId: number) {
    const turno = await tx.registroCaja.findUnique({
      where: { id: registroCajaId },
      select: {
        id: true,
        estado: true,
        saldoInicial: true,
        fondoFijo: true,
        sucursalId: true,
      },
    });
    if (!turno || turno.estado !== EstadoTurnoCaja.ABIERTO) {
      throw new BadRequestException('Turno no encontrado o ya cerrado');
    }

    const agg = await tx.movimientoFinanciero.aggregate({
      _sum: { deltaCaja: true },
      where: { registroCajaId },
    });

    const saldoInicial = Number(turno.saldoInicial ?? 0);
    const fondoFijo = Number(turno.fondoFijo ?? 0);
    const deltaCajaAcum = Number(agg._sum.deltaCaja ?? 0);

    const enCaja = saldoInicial + deltaCajaAcum; // puede ser < 0 si hubo mal registro
    const enCajaOperable = Math.max(0, enCaja); // para límites
    const maxDeposito = Math.max(enCaja - fondoFijo, 0); // “depositar todo” respetando fondo

    return {
      turno,
      saldoInicial,
      fondoFijo,
      enCaja,
      enCajaOperable,
      maxDeposito,
    };
  }

  async validarMovimientoEfectivo(
    tx: Prisma.TransactionClient,
    registroCajaId: number,
    deltaCajaPropuesto: number,
  ) {
    const { enCaja } = await this.getCajaEstado(tx, registroCajaId);
    if (enCaja + deltaCajaPropuesto < 0) {
      // si es egreso (deltaCajaPropuesto < 0), calcula cuánto sí se puede
      const maxEgresoPosible = Math.max(enCaja, 0);
      throw new UnprocessableEntityException(
        `Efectivo insuficiente. Disponible: Q ${maxEgresoPosible.toFixed(2)}`,
      );
    }
  }

  async validarDepositoCierre(
    tx: Prisma.TransactionClient,
    registroCajaId: number,
    monto: number, // positivo
  ) {
    const { maxDeposito } = await this.getCajaEstado(tx, registroCajaId);
    if (monto > maxDeposito) {
      throw new UnprocessableEntityException(
        `Depósito excede el efectivo disponible. Máximo permitido: Q ${maxDeposito.toFixed(2)}`,
      );
    }
  }
}
