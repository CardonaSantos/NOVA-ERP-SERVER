// dto/create-credito-authorization.dto.ts
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
  IsISO8601,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EstadoSolicitud, InteresTipo, PlanCuotaModo } from '@prisma/client';

export class CuotaPropuestaDto {
  @IsInt() numero: number; // 0 si ENGANCHE
  @IsISO8601() fechaISO: string;
  @IsNumber() monto: number;
  @IsOptional() @IsEnum(['ENGANCHE', 'NORMAL'] as any) etiqueta?:
    | 'ENGANCHE'
    | 'NORMAL';
  @IsOptional() @IsEnum(['AUTO', 'MANUAL'] as any) origen?: 'AUTO' | 'MANUAL';
  @IsOptional() @IsBoolean() esManual?: boolean;
  @IsOptional() @IsNumber() montoCapital?: number;
  @IsOptional() @IsNumber() montoInteres?: number;
}

export class CreateCreditoAutorizationDto {
  @IsInt() sucursalId: number;
  @IsInt() clienteId: number;

  interesSobreVenta?: number;

  @IsNumber() totalPropuesto: number; // principal (suma productos)
  @IsOptional() @IsNumber() cuotaInicialPropuesta?: number;
  @IsInt() cuotasTotalesPropuestas: number;

  @IsEnum(InteresTipo) interesTipo: InteresTipo;
  @IsInt() interesPorcentaje: number;
  @IsEnum(PlanCuotaModo) planCuotaModo: PlanCuotaModo;
  @IsInt() diasEntrePagos: number;
  @IsOptional() @IsISO8601() fechaPrimeraCuota?: string;

  @IsOptional() @IsString() comentario?: string;

  @IsOptional() @IsEnum(EstadoSolicitud) estado?: EstadoSolicitud;
  @IsInt() solicitadoPorId: number;

  // ====== NUEVO: persistimos plan propuesto ======
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CuotaPropuestaDto)
  cuotasPropuestas: CuotaPropuestaDto[];

  // lineas se mantiene igual a como ya la estás enviando:
  @IsArray() lineas: {
    productoId?: number;
    presentacionId?: number;
    cantidad: number;
    precioUnitario: number;
    precioSeleccionadoId: number;

    precioListaRef: number;
    subtotal: number;
  }[];
}
