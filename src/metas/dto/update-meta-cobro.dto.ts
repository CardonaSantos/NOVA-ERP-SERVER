import { PartialType } from '@nestjs/mapped-types';
import { CreateMetaDto } from './create-meta.dto';
import { CreateMetaUsuarioDto } from './MetaUsuarioDTO.dto';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { EstadoMetaCobro } from '@prisma/client';

export class UpdateMetaCobroDto {
  @IsDateString()
  @IsOptional()
  fechaInicio: string; // Fecha de inicio de la meta
  @IsOptional()
  @IsDateString()
  fechaFin: string; // Fecha de fin de la meta
  @IsPositive()
  montoMeta: number; // Monto objetivo de cobros

  @IsOptional()
  @IsString()
  tituloMeta?: string; // (Opcional) Título descriptivo de la meta

  @IsEnum(EstadoMetaCobro)
  estadoMetaCobro: EstadoMetaCobro;
}
