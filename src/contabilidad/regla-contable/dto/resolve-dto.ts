import { IsEnum, IsOptional } from 'class-validator';
import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
} from '@prisma/client';

export class ResolverReglaContableDto {
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
}
