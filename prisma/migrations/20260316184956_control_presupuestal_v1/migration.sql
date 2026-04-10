-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'CERRADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoMovimientoPresupuesto" AS ENUM ('ASIGNACION_INICIAL', 'COMPROMISO', 'EJERCICIO', 'LIBERACION_COMPROMISO', 'LIBERACION_EJERCICIO', 'AJUSTE_MANUAL');

-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "partidaPresupuestalId" INTEGER;

-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "centroCostoId" INTEGER;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "partidaPresupuestalId" INTEGER;

-- AlterTable
ALTER TABLE "Requisicion" ADD COLUMN     "centroCostoId" INTEGER;

-- CreateTable
CREATE TABLE "PeriodoPresupuestal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoPresupuestal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroCosto" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sucursalId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartidaPresupuestal" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartidaPresupuestal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" SERIAL NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "centroCostoId" INTEGER NOT NULL,
    "partidaId" INTEGER NOT NULL,
    "montoAsignado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoComprometido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoEjercido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoDisponible" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoPresupuesto" (
    "id" SERIAL NOT NULL,
    "presupuestoId" INTEGER NOT NULL,
    "tipoMovimiento" "TipoMovimientoPresupuesto" NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT,
    "requisicionId" INTEGER,
    "compraId" INTEGER,
    "usuarioId" INTEGER,
    "fechaMovimiento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoPresupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentroCosto_codigo_key" ON "CentroCosto"("codigo");

-- CreateIndex
CREATE INDEX "CentroCosto_sucursalId_idx" ON "CentroCosto"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "PartidaPresupuestal_codigo_key" ON "PartidaPresupuestal"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_periodoId_centroCostoId_partidaId_key" ON "Presupuesto"("periodoId", "centroCostoId", "partidaId");

-- CreateIndex
CREATE INDEX "MovimientoPresupuesto_presupuestoId_idx" ON "MovimientoPresupuesto"("presupuestoId");

-- CreateIndex
CREATE INDEX "MovimientoPresupuesto_requisicionId_idx" ON "MovimientoPresupuesto"("requisicionId");

-- CreateIndex
CREATE INDEX "MovimientoPresupuesto_compraId_idx" ON "MovimientoPresupuesto"("compraId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_partidaPresupuestalId_fkey" FOREIGN KEY ("partidaPresupuestalId") REFERENCES "PartidaPresupuestal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_partidaPresupuestalId_fkey" FOREIGN KEY ("partidaPresupuestalId") REFERENCES "PartidaPresupuestal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentroCosto" ADD CONSTRAINT "CentroCosto_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoPresupuestal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "PartidaPresupuestal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPresupuesto" ADD CONSTRAINT "MovimientoPresupuesto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPresupuesto" ADD CONSTRAINT "MovimientoPresupuesto_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPresupuesto" ADD CONSTRAINT "MovimientoPresupuesto_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPresupuesto" ADD CONSTRAINT "MovimientoPresupuesto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
