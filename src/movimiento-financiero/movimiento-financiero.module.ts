import { Module } from '@nestjs/common';
import { MovimientoFinancieroService } from './movimiento-financiero.service';
import { MovimientoFinancieroController } from './movimiento-financiero.controller';

import { PrismaModule } from 'src/prisma/prisma.module';
import { UtilitiesModule } from 'src/utilities/utilities.module';

import { ReglaContableModule } from 'src/contabilidad/regla-contable/regla-contable.module';
import { AsientoContableModule } from 'src/contabilidad/asiento-contable/asiento-contable.module';

@Module({
  imports: [
    PrismaModule,
    UtilitiesModule,
    ReglaContableModule,
    AsientoContableModule,
  ],
  controllers: [MovimientoFinancieroController],
  providers: [MovimientoFinancieroService],
  exports: [MovimientoFinancieroService],
})
export class MovimientoFinancieroModule {}
