-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CostoVentaTipo" ADD VALUE 'MATERIA_PRIMA';
ALTER TYPE "CostoVentaTipo" ADD VALUE 'MATERIAL_CONSUMIBLE';
ALTER TYPE "CostoVentaTipo" ADD VALUE 'SERVICIOS_TERCEROS';
ALTER TYPE "CostoVentaTipo" ADD VALUE 'IMPORTACION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GastoOperativoTipo" ADD VALUE 'COMBUSTIBLE';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'MANTENIMIENTO';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'REPUESTOS';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'LIMPIEZA';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'PAPELERIA';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'HERRAMIENTAS';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'SEGUROS';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'COMISIONES';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'IMPUESTOS';
ALTER TYPE "GastoOperativoTipo" ADD VALUE 'SERVICIOS_TECNICOS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MotivoMovimiento" ADD VALUE 'VENTA_CREDITO';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'COMPRA_INSUMOS';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'PAGO_PROVEEDOR_EFECTIVO';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'PAGO_NOMINA';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'PAGO_ALQUILER';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'PAGO_SERVICIOS';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'PAGO_IMPUESTOS';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'PAGO_COMISIONES';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'CAJA_A_BANCO';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'ANTICIPO_CLIENTE';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'ANTICIPO_PROVEEDOR';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'DEVOLUCION_PROVEEDOR';
ALTER TYPE "MotivoMovimiento" ADD VALUE 'OTRO_EGRESO';
