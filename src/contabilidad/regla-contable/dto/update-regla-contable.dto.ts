import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
} from '@prisma/client';

export class UpdateReglaContableDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  descripcion?: string;

  @IsOptional()
  @IsEnum(ClasificacionAdmin)
  clasificacion?: ClasificacionAdmin;

  @IsOptional()
  @IsEnum(MotivoMovimiento)
  motivo?: MotivoMovimiento;

  @IsOptional()
  @IsEnum(MetodoPago)
  metodoPago?: MetodoPago;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  cuentaDebeId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  cuentaHaberId?: number;

  @IsOptional()
  @IsBoolean()
  usaCentroCosto?: boolean;

  @IsOptional()
  @IsBoolean()
  usaPartidaPresupuestal?: boolean;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  prioridad?: number;
}
