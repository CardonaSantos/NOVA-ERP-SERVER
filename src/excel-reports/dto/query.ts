import { MetodoPago, TipoComprobante } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional } from 'class-validator';

export class QueryReport {
  @IsOptional()
  fechaInicio?: string;

  @IsOptional()
  fechaFin?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(MetodoPago, { each: true })
  metodosPago?: MetodoPago[];

  @IsOptional()
  @IsArray()
  @IsEnum(TipoComprobante, { each: true })
  comprobantes?: TipoComprobante[];

  @IsOptional()
  @IsNumber()
  montoMin?: number;

  @IsOptional()
  @IsNumber()
  montoMax?: number;
}
