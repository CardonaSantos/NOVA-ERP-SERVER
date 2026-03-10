import { PlantillaLegalCredito } from '../entities/plantilla-legal-credito.entity';
import { CreatePlantillaLegalCreditoDto } from '../dto/create-plantilla-legal-credito.dto';
import { UpdatePlantillaLegalCreditoDto } from '../dto/update-plantilla-legal-credito.dto';

export class PlantillaLegalMapper {
  static fromCreateDto(
    dto: CreatePlantillaLegalCreditoDto,
  ): PlantillaLegalCredito {
    return new PlantillaLegalCredito({
      tipo: dto.tipo,
      nombre: dto.nombre,
      contenido: dto.contenido,
      version: dto.version,
      activa: dto.activa ?? true,
    });
  }

  static fromUpdateDto(
    dto: UpdatePlantillaLegalCreditoDto,
  ): PlantillaLegalCredito {
    return new PlantillaLegalCredito({
      ...(dto.tipo !== undefined && { tipo: dto.tipo }),
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.contenido !== undefined && { contenido: dto.contenido }),
      ...(dto.version !== undefined && { version: dto.version }),
      ...(dto.activa !== undefined && { activa: dto.activa }),
    });
  }
}
