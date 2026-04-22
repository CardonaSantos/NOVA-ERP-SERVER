import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAsientoContableLineaDto } from './create-asiento-contable.dto';
import { OrigenAsientoContable } from '@prisma/client';

export class CreateAsientoContableDto {
  @IsString()
  @MinLength(5)
  descripcion: string;

  @IsEnum(OrigenAsientoContable)
  origen: OrigenAsientoContable;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  origenId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAsientoContableLineaDto)
  lineas: CreateAsientoContableLineaDto[];
}
