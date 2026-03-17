import {
  IsString,
  IsNotEmpty,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePeriodoDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del periodo es obligatorio' })
  @MinLength(3, { message: 'El nombre es muy corto (mínimo 3 caracteres)' })
  @MaxLength(50, { message: 'El nombre es muy largo (máximo 50 caracteres)' })
  nombre: string;

  @IsDateString(
    {},
    { message: 'La fecha de inicio debe tener un formato ISO8601 válido' },
  )
  @IsNotEmpty({ message: 'La fecha de inicio es obligatoria' })
  fechaInicio: string;

  @IsDateString(
    {},
    { message: 'La fecha de fin debe tener un formato ISO8601 válido' },
  )
  @IsNotEmpty({ message: 'La fecha de fin es obligatoria' })
  fechaFin: string;
}
