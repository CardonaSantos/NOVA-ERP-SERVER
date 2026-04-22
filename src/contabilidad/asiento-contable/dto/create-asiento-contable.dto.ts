import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAsientoContableLineaDto {
  @IsInt()
  @Type(() => Number)
  cuentaContableId: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  debe: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  haber: number;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
