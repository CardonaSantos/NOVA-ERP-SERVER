-- AlterTable
ALTER TABLE "AbonoCredito" ADD COLUMN     "movimientoFinancieroId" INTEGER;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_movimientoFinancieroId_fkey" FOREIGN KEY ("movimientoFinancieroId") REFERENCES "MovimientoFinanciero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
