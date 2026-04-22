/*
  Warnings:

  - A unique constraint covering the columns `[asientoContableId]` on the table `AbonoCredito` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[asientoContableId]` on the table `Compra` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cuentaContableId]` on the table `CuentaBancaria` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[asientoContableId]` on the table `CxPDocumento` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[asientoContableId]` on the table `CxPPago` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[asientoContableId]` on the table `MovimientoFinanciero` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[asientoContableId]` on the table `Venta` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TipoCuentaContable" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'COSTO', 'GASTO', 'ORDEN');

-- CreateEnum
CREATE TYPE "NaturalezaCuentaContable" AS ENUM ('DEUDORA', 'ACREEDORA');

-- CreateEnum
CREATE TYPE "EstadoAsientoContable" AS ENUM ('BORRADOR', 'POSTEADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "OrigenAsientoContable" AS ENUM ('VENTA', 'COMPRA', 'MOVIMIENTO_FINANCIERO', 'CXP_DOCUMENTO', 'CXP_PAGO', 'ABONO_CREDITO', 'AJUSTE_STOCK', 'TRANSFERENCIA', 'GARANTIA', 'OTRO');

-- CreateEnum
CREATE TYPE "MetodoValorizacionInventario" AS ENUM ('FIFO', 'PROMEDIO');

-- AlterTable
ALTER TABLE "AbonoCredito" ADD COLUMN     "asientoContableId" INTEGER;

-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "asientoContableId" INTEGER;

-- AlterTable
ALTER TABLE "CuentaBancaria" ADD COLUMN     "cuentaContableId" INTEGER;

-- AlterTable
ALTER TABLE "CxPDocumento" ADD COLUMN     "asientoContableId" INTEGER;

-- AlterTable
ALTER TABLE "CxPPago" ADD COLUMN     "asientoContableId" INTEGER;

-- AlterTable
ALTER TABLE "MovimientoFinanciero" ADD COLUMN     "asientoContableId" INTEGER;

-- AlterTable
ALTER TABLE "PartidaPresupuestal" ADD COLUMN     "cuentaContableId" INTEGER;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "asientoContableId" INTEGER;

-- CreateTable
CREATE TABLE "CuentaContable" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCuentaContable" NOT NULL,
    "naturaleza" "NaturalezaCuentaContable" NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "permiteMovimiento" BOOLEAN NOT NULL DEFAULT true,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "cuentaPadreId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaContable" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "origen" "OrigenAsientoContable" NOT NULL,
    "clasificacion" "ClasificacionAdmin",
    "motivo" "MotivoMovimiento",
    "metodoPago" "MetodoPago",
    "cuentaDebeId" INTEGER NOT NULL,
    "cuentaHaberId" INTEGER NOT NULL,
    "usaCentroCosto" BOOLEAN NOT NULL DEFAULT false,
    "usaPartidaPresupuestal" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "prioridad" INTEGER NOT NULL DEFAULT 1,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsientoContable" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descripcion" TEXT NOT NULL,
    "referencia" TEXT,
    "origen" "OrigenAsientoContable" NOT NULL,
    "origenId" INTEGER,
    "estado" "EstadoAsientoContable" NOT NULL DEFAULT 'BORRADOR',
    "sucursalId" INTEGER,
    "usuarioId" INTEGER,
    "totalDebe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalHaber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsientoContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsientoContableLinea" (
    "id" SERIAL NOT NULL,
    "asientoContableId" INTEGER NOT NULL,
    "cuentaContableId" INTEGER NOT NULL,
    "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descripcion" TEXT,
    "centroCostoId" INTEGER,
    "partidaPresupuestalId" INTEGER,
    "proveedorId" INTEGER,
    "clienteId" INTEGER,
    "productoId" INTEGER,
    "ventaId" INTEGER,
    "compraId" INTEGER,
    "movimientoFinancieroId" INTEGER,
    "cxpDocumentoId" INTEGER,
    "cxpPagoId" INTEGER,
    "abonoCreditoId" INTEGER,
    "historialStockId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsientoContableLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KardexValorizado" (
    "id" SERIAL NOT NULL,
    "historialStockId" INTEGER,
    "productoId" INTEGER NOT NULL,
    "presentacionId" INTEGER,
    "sucursalId" INTEGER NOT NULL,
    "tipoMovimiento" "TipoMovimientoStock" NOT NULL,
    "cantidadEntrada" INTEGER NOT NULL DEFAULT 0,
    "cantidadSalida" INTEGER NOT NULL DEFAULT 0,
    "costoUnitario" DECIMAL(14,4) NOT NULL,
    "costoTotal" DECIMAL(14,2) NOT NULL,
    "saldoCantidad" INTEGER NOT NULL,
    "saldoCosto" DECIMAL(14,2) NOT NULL,
    "metodoValorizacion" "MetodoValorizacionInventario" NOT NULL DEFAULT 'PROMEDIO',
    "observaciones" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KardexValorizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaContable_codigo_key" ON "CuentaContable"("codigo");

-- CreateIndex
CREATE INDEX "CuentaContable_tipo_activa_idx" ON "CuentaContable"("tipo", "activa");

-- CreateIndex
CREATE INDEX "CuentaContable_cuentaPadreId_idx" ON "CuentaContable"("cuentaPadreId");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaContable_codigo_key" ON "ReglaContable"("codigo");

-- CreateIndex
CREATE INDEX "ReglaContable_origen_clasificacion_motivo_metodoPago_idx" ON "ReglaContable"("origen", "clasificacion", "motivo", "metodoPago");

-- CreateIndex
CREATE UNIQUE INDEX "KardexValorizado_historialStockId_key" ON "KardexValorizado"("historialStockId");

-- CreateIndex
CREATE INDEX "KardexValorizado_productoId_sucursalId_creadoEn_idx" ON "KardexValorizado"("productoId", "sucursalId", "creadoEn");

-- CreateIndex
CREATE INDEX "KardexValorizado_historialStockId_idx" ON "KardexValorizado"("historialStockId");

-- CreateIndex
CREATE UNIQUE INDEX "AbonoCredito_asientoContableId_key" ON "AbonoCredito"("asientoContableId");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_asientoContableId_key" ON "Compra"("asientoContableId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaBancaria_cuentaContableId_key" ON "CuentaBancaria"("cuentaContableId");

-- CreateIndex
CREATE UNIQUE INDEX "CxPDocumento_asientoContableId_key" ON "CxPDocumento"("asientoContableId");

-- CreateIndex
CREATE UNIQUE INDEX "CxPPago_asientoContableId_key" ON "CxPPago"("asientoContableId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoFinanciero_asientoContableId_key" ON "MovimientoFinanciero"("asientoContableId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_asientoContableId_key" ON "Venta"("asientoContableId");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaBancaria" ADD CONSTRAINT "CuentaBancaria_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "CuentaContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CxPDocumento" ADD CONSTRAINT "CxPDocumento_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CxPPago" ADD CONSTRAINT "CxPPago_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaPresupuestal" ADD CONSTRAINT "PartidaPresupuestal_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "CuentaContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_cuentaPadreId_fkey" FOREIGN KEY ("cuentaPadreId") REFERENCES "CuentaContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaContable" ADD CONSTRAINT "ReglaContable_cuentaDebeId_fkey" FOREIGN KEY ("cuentaDebeId") REFERENCES "CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaContable" ADD CONSTRAINT "ReglaContable_cuentaHaberId_fkey" FOREIGN KEY ("cuentaHaberId") REFERENCES "CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContable" ADD CONSTRAINT "AsientoContable_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContable" ADD CONSTRAINT "AsientoContable_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_asientoContableId_fkey" FOREIGN KEY ("asientoContableId") REFERENCES "AsientoContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_partidaPresupuestalId_fkey" FOREIGN KEY ("partidaPresupuestalId") REFERENCES "PartidaPresupuestal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_movimientoFinancieroId_fkey" FOREIGN KEY ("movimientoFinancieroId") REFERENCES "MovimientoFinanciero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_cxpDocumentoId_fkey" FOREIGN KEY ("cxpDocumentoId") REFERENCES "CxPDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_cxpPagoId_fkey" FOREIGN KEY ("cxpPagoId") REFERENCES "CxPPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_abonoCreditoId_fkey" FOREIGN KEY ("abonoCreditoId") REFERENCES "AbonoCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_historialStockId_fkey" FOREIGN KEY ("historialStockId") REFERENCES "HistorialStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexValorizado" ADD CONSTRAINT "KardexValorizado_historialStockId_fkey" FOREIGN KEY ("historialStockId") REFERENCES "HistorialStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexValorizado" ADD CONSTRAINT "KardexValorizado_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexValorizado" ADD CONSTRAINT "KardexValorizado_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "ProductoPresentacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexValorizado" ADD CONSTRAINT "KardexValorizado_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
