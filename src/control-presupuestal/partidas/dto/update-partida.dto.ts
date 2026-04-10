import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePartidaPresupuestalDto } from './create-partida.dto';

export class UpdatePartidaDto extends PartialType(
  CreatePartidaPresupuestalDto,
) {
  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
