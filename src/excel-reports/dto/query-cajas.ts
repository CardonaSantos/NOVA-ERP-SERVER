import { IsArray, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
export class QueryReportCajas {
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  ids?: number[];
}
