import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import {
  ClasificacionAdmin,
  EstadoAsientoContable,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
} from '@prisma/client';

const toNumberOrUndefined = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toDateOrUndefined = (value?: string): Date | undefined =>
  value ? new Date(value) : undefined;

export class ReportQueryBaseDto {
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  search?: string;
}

export class ReportQueryOrganizationalDto extends ReportQueryBaseDto {
  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  sucursalId?: number;

  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  usuarioId?: number;
}

export class ReportQueryAccountingDto extends ReportQueryOrganizationalDto {
  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  cuentaContableId?: number;

  @IsOptional()
  @IsEnum(OrigenAsientoContable)
  origen?: OrigenAsientoContable;

  @IsOptional()
  @IsEnum(EstadoAsientoContable)
  estado?: EstadoAsientoContable;
}

export class ReportQueryOperationalDto extends ReportQueryOrganizationalDto {
  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  registroCajaId?: number;

  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  cuentaBancariaId?: number;

  @IsOptional()
  @IsEnum(MotivoMovimiento)
  motivo?: MotivoMovimiento;

  @IsOptional()
  @IsEnum(ClasificacionAdmin)
  clasificacion?: ClasificacionAdmin;

  @IsOptional()
  @IsEnum(MetodoPago)
  metodoPago?: MetodoPago;
}

export class ReportQueryThirdPartyDto extends ReportQueryBaseDto {
  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @IsOptional()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  proveedorId?: number;
}

export class QueryLibroMayorDto extends ReportQueryAccountingDto {
  @IsDefined()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  declare cuentaContableId: number;
}

export class QueryEstadoCuentaContableDto extends ReportQueryAccountingDto {
  @IsDefined()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  declare cuentaContableId: number;
}

export class QueryEstadoCuentaClienteDto extends ReportQueryThirdPartyDto {
  @IsDefined()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  declare clienteId: number;
}

export class QueryEstadoCuentaProveedorDto extends ReportQueryThirdPartyDto {
  @IsDefined()
  @Transform(toNumberOrUndefined)
  @IsInt()
  @Min(1)
  declare proveedorId: number;
}

export const normalizeReportQuery = (dto: ReportQueryBaseDto) => ({
  ...dto,
  fechaInicio: toDateOrUndefined(dto.fechaInicio),
  fechaFin: toDateOrUndefined(dto.fechaFin),
});
