import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class LiberarSaldoDto {
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
