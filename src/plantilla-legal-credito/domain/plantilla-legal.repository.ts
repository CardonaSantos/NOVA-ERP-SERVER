import { PlantillaLegalCredito } from '../entities/plantilla-legal-credito.entity';
import { CreatePlantillaLegalCreditoDto } from '../dto/create-plantilla-legal-credito.dto';
import { UpdatePlantillaLegalCreditoDto } from '../dto/update-plantilla-legal-credito.dto';

export const PLANTILLA_LEGAL_CREDITO = Symbol('PLANTILLA_LEGAL_CREDITO');

export interface PlantillaLegalRepository {
  create(dto: CreatePlantillaLegalCreditoDto): Promise<PlantillaLegalCredito>;
  update(
    id: number,
    dto: UpdatePlantillaLegalCreditoDto,
  ): Promise<PlantillaLegalCredito>;
  delete(id: number): Promise<void>;
  findAll(): Promise<PlantillaLegalCredito[]>;
  findById(id: number): Promise<PlantillaLegalCredito | null>;

  getContratoHTML(
    ventaCuotaId: number,
    plantillaId: number,
  ): Promise<{
    ventaCuotaId: number;
    plantillaId: number;
    html: string;
  }>;
}
