// src/abono-cuota/dto/create-abono-cuota.dto.ts
import { MetodoPago } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAbonoCuotaDetalleDto {
  @IsInt()
  @IsPositive()
  cuotaId!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  montoCapital?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  montoInteres?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  montoMora?: number;

  @IsNumber()
  @Min(0)
  montoTotal!: number;
}

export class CreateAbonoCuotaDto {
  @IsInt()
  @IsPositive()
  ventaCuotaId!: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsInt()
  @IsPositive()
  sucursalId!: number;

  @IsInt()
  @IsPositive()
  usuarioId!: number;

  @IsEnum(MetodoPago)
  metodoPago!: MetodoPago;

  @IsString()
  @IsOptional()
  referenciaPago?: string;

  @IsNumber()
  @Min(0)
  montoTotal!: number;

  @IsDateString()
  @IsOptional()
  fechaAbono?: string;

  // opcional si vas a enlazar un asiento/registro de caja
  @IsInt()
  @IsOptional()
  registroCajaId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAbonoCuotaDetalleDto)
  detalles!: CreateAbonoCuotaDetalleDto[];
}
