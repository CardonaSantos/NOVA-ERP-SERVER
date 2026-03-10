-- CreateEnum
CREATE TYPE "TipoPlantillaLegal" AS ENUM ('CONTRATO', 'PAGARE');

-- CreateTable
CREATE TABLE "PlantillaLegal" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoPlantillaLegal" NOT NULL,
    "nombre" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantillaLegal_pkey" PRIMARY KEY ("id")
);
