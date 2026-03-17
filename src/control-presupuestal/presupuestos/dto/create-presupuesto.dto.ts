import { IsInt, IsNotEmpty, IsNumber, Min, IsPositive } from 'class-validator';

export class CreatePresupuestoDto {
  @IsInt({ message: 'El ID del periodo debe ser un número entero válido.' })
  @IsPositive({ message: 'El ID del periodo debe ser mayor a 0.' })
  @IsNotEmpty({ message: 'El periodo presupuestal es obligatorio.' })
  periodoId: number;

  @IsInt({ message: 'El ID del centro de costo debe ser un número entero.' })
  @IsPositive({ message: 'El ID del centro de costo debe ser mayor a 0.' })
  @IsNotEmpty({ message: 'El centro de costo es obligatorio.' })
  centroCostoId: number;

  @IsInt({ message: 'El ID de la partida debe ser un número entero.' })
  @IsPositive({
    message: 'El ID de la partida presupuestal debe ser mayor a 0.',
  })
  @IsNotEmpty({ message: 'La partida presupuestal es obligatoria.' })
  partidaId: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto asignado debe ser un número con máximo 2 decimales.' },
  )
  @Min(0.01, { message: 'El monto inicial asignado debe ser mayor a 0.' })
  @IsNotEmpty({ message: 'El monto asignado es obligatorio.' })
  montoAsignado: number;
}
