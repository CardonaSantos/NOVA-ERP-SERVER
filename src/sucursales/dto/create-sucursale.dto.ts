import { TipoSucursal } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsInt,
  IsPhoneNumber,
  IsEnum,
} from 'class-validator';

export class CreateSucursaleDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  pbx?: string;

  @IsEnum(TipoSucursal)
  tipoSucursal: TipoSucursal;

  @IsString()
  direccion: string;

  @IsString()
  telefono: string;

  @IsOptional()
  @IsInt()
  departamentoId?: number;

  @IsOptional()
  @IsInt()
  municipioId?: number;
}
