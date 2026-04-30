/**
 * Convierte un valor Decimal de Prisma (string) a Number.
 * Si el valor es inválido o nulo, retorna 0 (o el fallback que prefieras).
 */
export const parseDecimal = (value: any): number => {
  if (value === null || value === undefined) return 0;

  const parsed = Number(value);

  // Si por alguna razón no es un número válido, devolvemos 0
  return isNaN(parsed) ? 0 : parsed;
};
