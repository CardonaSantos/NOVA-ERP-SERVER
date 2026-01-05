// src/venta/dto/query-ventas-table.dto.ts
import { MetodoPago, TipoComprobante } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// helpers
const emptyToUndef = ({ value }: { value: any }) =>
  value === '' || value === null || value === undefined ? undefined : value;

const toNumOrUndef = ({ value }: { value: any }) =>
  value === '' || value == null ? undefined : Number(value);

const toStringOrUndef = ({ value }: { value: any }) =>
  value === '' || value == null ? undefined : String(value);

const toStringLowerOrUndef = ({ value }: { value: any }) =>
  value === '' || value == null ? undefined : String(value).toLowerCase();

const toArrayOfNumber = ({ value }: { value: any }) => {
  if (value === '' || value == null) return undefined;
  if (Array.isArray(value)) return value.map((v) => Number(v));
  return [Number(value)];
};

const toArrayOfEnum =
  <T extends string>() =>
  ({ value }: { value: any }) => {
    if (value === '' || value == null) return undefined;
    if (Array.isArray(value)) return value as T[];
    return [value as T];
  };

export class QueryVentasTable {
  // ——— Paginación
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(toNumOrUndef)
  page?: number; // 1-based

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(toNumOrUndef)
  limit?: number; // tamaño de página

  // ——— Orden (opcional)
  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  sortBy?: 'fechaVenta' | 'totalVenta' | 'clienteNombre';

  @IsOptional()
  @IsString()
  @Transform(toStringLowerOrUndef)
  sortDir?: 'asc' | 'desc';

  // ——— Scope por sucursal
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Transform(toNumOrUndef)
  sucursalId?: number;

  // ——— Búsquedas / filtros
  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  nombreCliente?: string; // coincide con cliente.nombre o nombreClienteFinal

  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  telefonoCliente?: string; // coincide con cliente.telefono o telefonoClienteFinal

  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  referenciaPago?: string;

  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  codigoItem?: string; // producto.codigoProducto o presentacion.codigoBarras

  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  texto?: string; // búsqueda general: cliente, referencia, códigos, etc.

  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  fechaDesde?: string; // ISO date (YYYY-MM-DD)

  @IsOptional()
  @IsString()
  @Transform(toStringOrUndef)
  fechaHasta?: string; // ISO date (YYYY-MM-DD)

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Transform(toNumOrUndef)
  montoMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Transform(toNumOrUndef)
  montoMax?: number;

  @IsOptional()
  @IsArray()
  @Transform(toArrayOfNumber)
  cats?: number[]; // categorías (ids) asociadas a productos

  @IsOptional()
  @IsArray()
  @Transform(toArrayOfEnum<MetodoPago>())
  metodoPago?: MetodoPago[]; // por si filtras por método(s)

  @IsOptional()
  @IsArray()
  @Transform(toArrayOfEnum<TipoComprobante>())
  tipoComprobante?: TipoComprobante[];

  @IsBoolean()
  @IsOptional()
  isVendedor: boolean;

  @IsInt()
  @IsOptional()
  usuarioId: number;
}
