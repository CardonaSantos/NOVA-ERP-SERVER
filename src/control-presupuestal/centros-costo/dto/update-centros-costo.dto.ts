import { PartialType } from '@nestjs/mapped-types';
import { CreateCentrosCostoDto } from './create-centros-costo.dto';

export class UpdateCentrosCostoDto extends PartialType(CreateCentrosCostoDto) {}
