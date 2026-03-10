import { TipoPlantillaLegal } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreatePlantillaLegalCreditoDto {
  @IsEnum(TipoPlantillaLegal)
  tipo: TipoPlantillaLegal;

  @IsString()
  nombre: string;

  @IsString()
  contenido: string;

  @IsString()
  version: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean = true;
}
