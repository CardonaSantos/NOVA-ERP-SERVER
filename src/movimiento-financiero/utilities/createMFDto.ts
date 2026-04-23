// dto/crear-movimiento.dto.ts
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
  ClasificacionAdmin,
  CostoVentaTipo,
  GastoOperativoTipo,
  MetodoPago,
  MotivoMovimiento,
} from '@prisma/client';

export class CreateMFUtility {
  @IsInt()
  @Min(1)
  sucursalId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  registroCajaId?: number;

  @IsOptional()
  @IsEnum(GastoOperativoTipo)
  gastoOperativoTipo?: GastoOperativoTipo;

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
  esBancoACaja?: boolean;

  @IsOptional()
  @IsBoolean()
  esDepositoProveedor?: boolean;

  // relaciones opcionales para movimiento financiero, usuario y
  @IsOptional()
  @IsInt()
  proveedorId?: number;

  @IsOptional()
  @IsInt()
  cuentaBancariaId?: number;

  @IsOptional()
  @IsString()
  costoVentaTipo?: CostoVentaTipo;

  // quien registra
  @IsInt()
  @Min(1)
  usuarioId!: number;

  clasificacionAdmin?: ClasificacionAdmin;
}
