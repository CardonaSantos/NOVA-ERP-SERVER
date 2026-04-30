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
  OrigenAsientoContable,
} from '@prisma/client';

export class CreateReglaContableDto {
  @IsString()
  @MinLength(3)
  codigo: string;

  @IsString()
  @MinLength(3)
  nombre: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  descripcion?: string;

  @IsEnum(OrigenAsientoContable)
  origen: OrigenAsientoContable;

  @IsOptional()
  @IsEnum(ClasificacionAdmin)
  clasificacion?: ClasificacionAdmin;

  @IsOptional()
  @IsEnum(MotivoMovimiento)
  motivo?: MotivoMovimiento;

  @IsOptional()
  @IsEnum(MetodoPago)
  metodoPago?: MetodoPago;

  @IsInt()
  @Type(() => Number)
  cuentaDebeId: number;

  @IsInt()
  @Type(() => Number)
  cuentaHaberId: number;

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
