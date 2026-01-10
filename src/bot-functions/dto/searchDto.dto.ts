import { IsArray, IsOptional, IsString } from 'class-validator';

export class BotSearchProductoDto {
  producto: string;

  categorias?: string[];
}
