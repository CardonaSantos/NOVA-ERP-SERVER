-- CreateEnum
CREATE TYPE "EstadoCuadreCaja" AS ENUM ('CUADRA', 'SOBRANTE', 'FALTANTE');

-- AlterTable
ALTER TABLE "RegistroCaja" ADD COLUMN     "comentarioCuadre" TEXT,
ADD COLUMN     "diferenciaCaja" DECIMAL(14,2),
ADD COLUMN     "efectivoContado" DECIMAL(14,2),
ADD COLUMN     "estadoCuadre" "EstadoCuadreCaja";
