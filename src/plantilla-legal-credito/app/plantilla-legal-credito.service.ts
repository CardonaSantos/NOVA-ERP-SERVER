import { Inject, Injectable } from '@nestjs/common';
import { CreatePlantillaLegalCreditoDto } from '../dto/create-plantilla-legal-credito.dto';
import { UpdatePlantillaLegalCreditoDto } from '../dto/update-plantilla-legal-credito.dto';
import {
  PLANTILLA_LEGAL_CREDITO,
  PlantillaLegalRepository,
} from '../domain/plantilla-legal.repository';

@Injectable()
export class PlantillaLegalCreditoService {
  constructor(
    @Inject(PLANTILLA_LEGAL_CREDITO)
    private readonly repo: PlantillaLegalRepository,
  ) {}

  async create(dto: CreatePlantillaLegalCreditoDto) {
    return this.repo.create(dto);
  }

  async update(id: number, dto: UpdatePlantillaLegalCreditoDto) {
    return this.repo.update(id, dto);
  }

  async delete(id: number) {
    return this.repo.delete(id);
  }

  async findAll() {
    return this.repo.findAll();
  }

  async findById(id: number) {
    return this.repo.findById(id);
  }

  async getContratoHTML(ventaCuotaId: number, plantillaId: number) {
    return this.repo.getContratoHTML(ventaCuotaId, plantillaId);
  }
}
