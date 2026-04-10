import { IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TipoMovimientoPresupuesto } from '../interfaces/interfaces';

export class QueryMovimientosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  centroCostoId?: number;

  @IsOptional()
  @IsEnum(TipoMovimientoPresupuesto, {
    message: `tipo debe ser uno de: ${Object.values(TipoMovimientoPresupuesto).join(', ')}`,
  })
  tipo?: TipoMovimientoPresupuesto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
