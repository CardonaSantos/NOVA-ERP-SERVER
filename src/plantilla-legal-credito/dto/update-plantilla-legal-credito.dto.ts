import { PartialType } from '@nestjs/mapped-types';
import { CreatePlantillaLegalCreditoDto } from './create-plantilla-legal-credito.dto';

export class UpdatePlantillaLegalCreditoDto extends PartialType(CreatePlantillaLegalCreditoDto) {}
