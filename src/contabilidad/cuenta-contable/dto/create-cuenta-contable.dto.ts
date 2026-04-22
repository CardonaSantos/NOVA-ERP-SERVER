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

export class CreateCuentaContableDto {
  @IsString()
  @MinLength(2)
  codigo: string;

  @IsString()
  @MinLength(3)
  nombre: string;

  @IsEnum(TipoCuentaContable)
  tipo: TipoCuentaContable;

  @IsEnum(NaturalezaCuentaContable)
  naturaleza: NaturalezaCuentaContable;

  @IsOptional()
  @IsBoolean()
  permiteMovimiento?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  padreId?: number;
}
