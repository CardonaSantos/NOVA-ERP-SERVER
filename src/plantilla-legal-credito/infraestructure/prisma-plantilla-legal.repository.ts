// infraestructure/prisma-plantilla-legal.repository.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlantillaLegalRepository } from '../domain/plantilla-legal.repository';
import { PlantillaLegalCredito } from '../entities/plantilla-legal-credito.entity';
import { CreatePlantillaLegalCreditoDto } from '../dto/create-plantilla-legal-credito.dto';
import { UpdatePlantillaLegalCreditoDto } from '../dto/update-plantilla-legal-credito.dto';
import { PlantillaLegalMapper } from '../common/mapper';
import {
  buildVentaCuotaVariables,
  renderPlantilla,
} from 'src/utils/render-plantillas';

@Injectable()
export class PrismaPlantillaLegal implements PlantillaLegalRepository {
  private readonly logger = new Logger(PrismaPlantillaLegal.name);
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreatePlantillaLegalCreditoDto,
  ): Promise<PlantillaLegalCredito> {
    const entity = PlantillaLegalMapper.fromCreateDto(dto);
    const raw = await this.prisma.plantillaLegal.create({
      data: entity.toPrismaCreate(),
    });
    return PlantillaLegalCredito.fromPrisma(raw);
  }

  async update(
    id: number,
    dto: UpdatePlantillaLegalCreditoDto,
  ): Promise<PlantillaLegalCredito> {
    await this.findOrFail(id);
    const entity = PlantillaLegalMapper.fromUpdateDto(dto);
    const raw = await this.prisma.plantillaLegal.update({
      where: { id },
      data: entity.toPrismaUpdate(),
    });
    return PlantillaLegalCredito.fromPrisma(raw);
  }

  async delete(id: number): Promise<void> {
    await this.findOrFail(id);
    await this.prisma.plantillaLegal.delete({ where: { id } });
  }

  async findAll(): Promise<PlantillaLegalCredito[]> {
    const rows = await this.prisma.plantillaLegal.findMany({
      orderBy: { creadoEn: 'desc' },
    });
    return rows.map(PlantillaLegalCredito.fromPrisma);
  }

  async findById(id: number): Promise<PlantillaLegalCredito | null> {
    const raw = await this.prisma.plantillaLegal.findUnique({ where: { id } });
    return raw ? PlantillaLegalCredito.fromPrisma(raw) : null;
  }

  private async findOrFail(id: number) {
    const exists = await this.prisma.plantillaLegal.findUnique({
      where: { id },
    });
    if (!exists)
      throw new NotFoundException(`PlantillaLegal #${id} no encontrada`);
  }

  async getContratoHTML(ventaCuotaId: number, plantillaId: number) {
    const ventaCuota = await this.prisma.ventaCuota.findUnique({
      where: { id: ventaCuotaId },
      include: {
        cliente: {
          include: {
            municipio: true,
            departamento: true,
          },
        },
        usuario: true,
        sucursal: true,
        cuotas: true,
        abonos: true,
        venta: {
          include: {
            productos: {
              include: { producto: true },
            },
            metodoPago: true,
          },
        },
      },
    });
    this.logger.log(
      `La ventaCuota es:\n${JSON.stringify(ventaCuota, null, 2)}`,
    );

    this.logger.log(
      `Las cuotas de la ventacuota son:\n${JSON.stringify(ventaCuota.cuotas, null, 2)}`,
    );

    this.logger.log(
      `EL client es:\n${JSON.stringify(ventaCuota.cliente, null, 2)}`,
    );

    this.logger.log(
      `El interes es:\n${JSON.stringify(ventaCuota.interes, null, 2)}`,
    );

    this.logger.log(
      `La venta es:\n${JSON.stringify(ventaCuota.venta, null, 2)}`,
    );

    if (!ventaCuota) throw new NotFoundException('Crédito no encontrado');

    const plantilla = await this.prisma.plantillaLegal.findUnique({
      where: { id: plantillaId },
    });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

    const variables = buildVentaCuotaVariables({
      sucursal: ventaCuota.sucursal,
      ventaCuota,
    });

    const html = renderPlantilla(plantilla.contenido, variables);

    return { ventaCuotaId, plantillaId, html };
  }
}
