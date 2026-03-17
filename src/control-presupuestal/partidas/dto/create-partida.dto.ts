import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePartidaPresupuestalDto {
  @IsString({ message: 'El código debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El código es obligatorio.' })
  @Matches(/^[A-Z0-9]+-[A-Z0-9]+$/i, {
    message: 'El código debe tener un formato válido (Ej: 5100-PAP).',
  })
  codigo: string;

  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres.' })
  nombre: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto.' })
  @IsOptional()
  @MaxLength(255, {
    message: 'La descripción no puede exceder los 255 caracteres.',
  })
  descripcion?: string;
}
