import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateCentroCostoDto {
  @IsString()
  @IsOptional()
  @MaxLength(20, { message: 'El código no puede exceder los 20 caracteres' })
  codigo?: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del centro de costo es obligatorio' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(100)
  nombre: string;

  @IsInt({ message: 'El ID de la sucursal debe ser un número entero' })
  @IsNotEmpty({ message: 'La sucursal es obligatoria' })
  sucursalId: number;
}
