import { IsArray, IsOptional, IsString } from 'class-validator'; // Quitamos IsInt

export class BotSearchProductoDto {
  @IsOptional()
  @IsString() // <--- CORRECCIÓN: Era @IsInt(), debe ser @IsString()
  producto: string;

  @IsOptional() // Agrega opcional por seguridad si a veces no envías categorías
  @IsArray()
  @IsString({ each: true }) // Valida que cada item del array sea string
  categorias: Array<string>;
}
