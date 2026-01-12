import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreditoQuery } from './query/query';
import { SelectCreditos } from './select/select-creditosResponse';
import { normalizerCreditoRegist } from './common/normalizadorCredito';
import { simpleCreditNormalizer } from './common/simpleNormalizacer';

@Injectable()
export class CreditoService {
  private readonly logger = new Logger(CreditoService.name);
  constructor(private readonly prisma: PrismaService) {}
  create(createCreditoDto: CreateCreditoDto) {
    return 'This action adds a new credito';
  }

  buildWhereCreditos(query: CreditoQuery): Prisma.VentaCuotaWhereInput {
    const where: Prisma.VentaCuotaWhereInput = {};

    // Filtros directos
    if (query.sucursalId) where.sucursalId = query.sucursalId;
    if (query.clienteId) where.clienteId = query.clienteId;
    if (query.usuarioId) where.usuarioId = query.usuarioId;
    if (query.estado) where.estado = query.estado;
    if (query.frecuenciaPago) where.frecuenciaPago = query.frecuenciaPago;
    if (query.interesTipo) where.interesTipo = query.interesTipo;
    if (query.planCuotaModo) where.planCuotaModo = query.planCuotaModo;
    if (query.numeroCredito)
      where.numeroCredito = {
        contains: query.numeroCredito,
        mode: 'insensitive',
      };
    if (query.ventaId) where.ventaId = query.ventaId;

    // Rango de fechas
    if (query.fechaInicioFrom || query.fechaInicioTo) {
      where.fechaInicio = {};
      if (query.fechaInicioFrom)
        (where.fechaInicio as any).gte = query.fechaInicioFrom;
      if (query.fechaInicioTo)
        (where.fechaInicio as any).lte = query.fechaInicioTo;
    }

    if (query.proximoPagoFrom || query.proximoPagoTo) {
      where.fechaProximoPago = {};
      if (query.proximoPagoFrom)
        (where.fechaProximoPago as any).gte = query.proximoPagoFrom;
      if (query.proximoPagoTo)
        (where.fechaProximoPago as any).lte = query.proximoPagoTo;
    }

    // Flags calculadas
    if (query.enMora) {
      where.OR = (where.OR || []).concat([
        { cuotas: { some: { estado: 'ATRASADA' } } },
        { cuotas: { some: { moraAcumulada: { gt: 0 } } } },
      ]);
    }

    if (query.vencidas) {
      // Alguna cuota con fecha vencida y no pagada
      const cond = {
        cuotas: {
          some: {
            fechaVencimiento: { lt: new Date() },
            NOT: { estado: 'PAGADA' },
          },
        },
      } as Prisma.VentaCuotaWhereInput;

      // Ensure where.AND is an array before concatenating to satisfy TypeScript types
      const existingAnd = where.AND;
      const andArray: Prisma.VentaCuotaWhereInput[] = Array.isArray(existingAnd)
        ? existingAnd
        : existingAnd
          ? [existingAnd as Prisma.VentaCuotaWhereInput]
          : [];
      where.AND = andArray.concat([cond]);
    }

    // Búsqueda global q
    if (query.q?.trim()) {
      const q = query.q.trim();
      const isNumeric = /^\d+$/.test(q);
      const or: Prisma.VentaCuotaWhereInput[] = [
        { numeroCredito: { contains: q, mode: 'insensitive' } },
        { comentario: { contains: q, mode: 'insensitive' } },
        {
          cliente: {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { apellidos: { contains: q, mode: 'insensitive' } },
              { dpi: { contains: q, mode: 'insensitive' } },
              { telefono: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        { sucursal: { nombre: { contains: q, mode: 'insensitive' } } },
        {
          venta: {
            OR: [
              { referenciaPago: { contains: q, mode: 'insensitive' } },
              { imei: { contains: q, mode: 'insensitive' } },
              ...(isNumeric ? [{ id: Number(q) }] : []),
              {
                productos: {
                  some: {
                    OR: [
                      {
                        producto: {
                          nombre: { contains: q, mode: 'insensitive' },
                        },
                      },
                      {
                        producto: {
                          codigoProducto: { contains: q, mode: 'insensitive' },
                        },
                      },
                      {
                        presentacion: {
                          nombre: { contains: q, mode: 'insensitive' },
                        },
                      },
                      {
                        presentacion: {
                          codigoBarras: { contains: q, mode: 'insensitive' },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ];
      where.OR = (where.OR || []).concat(or);
    }

    return where;
  }

  async findAll(query: CreditoQuery) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;

      const where = this.buildWhereCreditos(query);
      this.logger.log(`where recibido:\n${JSON.stringify(where, null, 2)}`);
      // Orden seguro
      const sortable: Record<
        string,
        keyof Prisma.VentaCuotaOrderByWithRelationInput
      > = {
        fechaInicio: 'fechaInicio',
        fechaProximoPago: 'fechaProximoPago',
        creadoEn: 'creadoEn',
        totalVenta: 'totalVenta',
        totalPagado: 'totalPagado',
        numeroCredito: 'numeroCredito',
        estado: 'estado',
      };
      const sortBy = sortable[query.sortBy || 'fechaInicio'] || 'fechaInicio';
      const sortOrder: Prisma.SortOrder =
        query.sortOrder === 'asc' ? 'asc' : 'desc';

      const [total, creditos] = await this.prisma.$transaction([
        this.prisma.ventaCuota.count({ where }),
        this.prisma.ventaCuota.findMany({
          where,
          select: SelectCreditos,
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: limit,
        }),
      ]);

      this.logger.log('Los registros de productos son: ', creditos);

      const data = normalizerCreditoRegist(creditos);

      return {
        data,
        meta: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          sortBy,
          sortOrder,
          hasMore: page * limit < total,
        },
      };
    } catch (error: any) {
      this.logger.error('Error en módulo créditos', error?.stack || error);
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en módulo crédito',
      );
    }
  }

  async getOneCredito(creditId: number) {
    try {
      if (!creditId) throw new BadRequestException('Id de crédito no válido');

      const credit = await this.prisma.ventaCuota.findMany({
        where: { id: creditId },
        select: SelectCreditos,
      });

      const creditNormalizado = normalizerCreditoRegist(credit);
      const creditoNormalizado = creditNormalizado.shift();
      return creditoNormalizado;
    } catch (error) {
      this.logger.error('Error al conseguir registro de crédito', error?.stack);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal errror: Error inesperado');
    }
  }

  async getSimpleCredits() {
    try {
      const credits = await this.prisma.ventaCuota.findMany({
        where: {
          estado: {
            in: ['ACTIVA', 'EN_MORA', 'PAUSADA', 'REPROGRAMADA'],
          },
        },
        select: SelectCreditos,
        orderBy: {
          creadoEn: 'desc',
        },
      });
      const formatteds = simpleCreditNormalizer(credits);
      return formatteds;
    } catch (error) {
      this.logger.error('Error en módulo de credito-get: ', error?.stack);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Fatal Error: Error inesperado');
    }
  }

  //--------->
  async deleteOneCredito(creditoId: number) {
    if (!Number.isInteger(creditoId) || creditoId <= 0) {
      throw new BadRequestException('ID de crédito inválido');
    }

    try {
      const deleted = await this.prisma.ventaCuota.delete({
        where: { id: creditoId },
      });

      return { ok: true, id: deleted.id };
    } catch (error) {
      this.logger.error('Error generado es: ', error?.stack);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Crédito no encontrado');
      }

      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException('Error inesperado');
    }
  }
}
