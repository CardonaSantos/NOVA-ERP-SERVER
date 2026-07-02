import { IsBooleanString, IsInt, IsOptional, IsString } from 'class-validator';

export class ReporteCajaMonetarioQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsInt()
  sucursalId?: number;

  @IsOptional()
  @IsInt()
  usuarioId?: number;

  @IsOptional()
  @IsString()
  estadoCaja?: string;

  @IsOptional()
  @IsString()
  clasificacion?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsInt()
  cuentaBancariaId?: number;

  @IsOptional()
  @IsBooleanString()
  incluirMovimientos?: string;
}
