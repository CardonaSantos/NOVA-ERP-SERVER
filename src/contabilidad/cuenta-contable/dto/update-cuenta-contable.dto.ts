import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NaturalezaCuentaContable, TipoCuentaContable } from '../types/types';

export class UpdateCuentaContableDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  nombre?: string;

  @IsOptional()
  @IsEnum(TipoCuentaContable)
  tipo?: TipoCuentaContable;

  @IsOptional()
  @IsEnum(NaturalezaCuentaContable)
  naturaleza?: NaturalezaCuentaContable;

  @IsOptional()
  @IsBoolean()
  permiteMovimiento?: boolean;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  padreId?: number | null;
}
