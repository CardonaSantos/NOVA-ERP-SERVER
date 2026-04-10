import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ComprometerSaldoDto {
  @IsNumber()
  @IsPositive()
  monto: number;

  @IsNumber()
  requisicionId: number;

  @IsNumber()
  usuarioId: number;

  @IsOptional()
  @IsString()
  descripcion?: string;
}

export class EjercerSaldoDto {
  @IsNumber()
  @IsPositive()
  monto: number;

  @IsNumber()
  compraId: number;

  @IsNumber()
  usuarioId: number;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
