-- AlterTable
ALTER TABLE "Requisicion" ADD COLUMN     "presupuestoId" INTEGER;

-- AddForeignKey
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
