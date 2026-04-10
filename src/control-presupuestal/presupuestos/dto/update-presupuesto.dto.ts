import { IsNumber, Min, IsOptional } from 'class-validator';

export class UpdatePresupuestoDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto asignado debe ser un número válido.' },
  )
  @Min(0, { message: 'El monto asignado no puede ser negativo.' })
  @IsOptional()
  montoAsignado?: number;

  nombre?: string;
}
