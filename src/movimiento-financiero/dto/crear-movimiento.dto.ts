import {
  IsInt,
  Min,
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import {
  CostoVentaTipo,
  GastoOperativoTipo,
  MetodoPago,
  MotivoMovimiento,
} from '@prisma/client';

export class CrearMovimientoDto {
  @IsInt()
  @Min(1)
  sucursalId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  registroCajaId?: number;

  @IsNumber()
  @Min(0.01)
  monto!: number;

  @IsEnum(MotivoMovimiento)
  motivo!: MotivoMovimiento;

  @IsOptional()
  @IsEnum(MetodoPago)
  metodoPago?: MetodoPago;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsBoolean()
  esDepositoCierre?: boolean;

  @IsOptional()
  @IsBoolean()
  esDepositoProveedor?: boolean;

  @IsOptional()
  @IsInt()
  proveedorId?: number;

  @IsOptional()
  @IsInt()
  cuentaBancariaId?: number;

  @IsOptional()
  @IsEnum(GastoOperativoTipo)
  gastoOperativoTipo?: GastoOperativoTipo;

  @IsOptional()
  @IsEnum(CostoVentaTipo)
  costoVentaTipo?: CostoVentaTipo;

  @IsInt()
  @Min(1)
  usuarioId!: number;
}
