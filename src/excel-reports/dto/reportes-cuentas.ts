import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class BaseEstadoCuentaDto {
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
export class QueryEstadoCuentaClienteDto extends BaseEstadoCuentaDto {
  @IsInt()
  clienteId: number;
}
export class QueryEstadoCuentaProveedorDto extends BaseEstadoCuentaDto {
  @IsInt()
  proveedorId: number;
}
export class QueryEstadoCuentaContableDto extends BaseEstadoCuentaDto {
  @IsInt()
  cuentaContableId: number;
}
