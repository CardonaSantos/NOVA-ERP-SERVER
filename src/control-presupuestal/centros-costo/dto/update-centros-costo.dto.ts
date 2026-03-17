import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCentroCostoDto } from './create-centros-costo.dto';

export class UpdateCentroCostoDto extends PartialType(CreateCentroCostoDto) {
  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  @IsOptional()
  activo?: boolean;
}
