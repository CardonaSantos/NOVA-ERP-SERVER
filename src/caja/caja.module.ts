import { Module } from '@nestjs/common';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilitiesService } from 'src/utilities/utilities.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UtilitiesModule } from 'src/utilities/utilities.module';
import { ContabilizacionVentasService } from './contabilizacion.service';
import { ReglaContableModule } from 'src/contabilidad/regla-contable/regla-contable.module';
import { AsientoContableModule } from 'src/contabilidad/asiento-contable/asiento-contable.module';

// @Module({
//   imports: [
//     PrismaModule,
//     UtilitiesModule,
//     ReglaContableModule,
//     AsientoContableModule,
//   ],
//   controllers: [CajaController],
//   providers: [CajaService, ContabilizacionVentasService],
//   exports: [CajaService, ContabilizacionVentasService],
// })
// export class CajaModule {}
@Module({
  imports: [
    PrismaModule,
    UtilitiesModule,
    ReglaContableModule,
    AsientoContableModule,
  ],
  controllers: [CajaController],
  providers: [CajaService, ContabilizacionVentasService],
  exports: [CajaService], // 👈 suficiente
})
export class CajaModule {}
