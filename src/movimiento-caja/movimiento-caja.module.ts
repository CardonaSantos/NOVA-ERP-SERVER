import { Module } from '@nestjs/common';
import { MovimientoCajaService } from './movimiento-caja.service';
import { MovimientoCajaController } from './movimiento-caja.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilidadesService } from 'src/caja/utilidades/utilidades.service';
import { CajaService } from 'src/caja/caja.service';
import { CajaModule } from 'src/caja/caja.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UtilitiesModule } from 'src/utilities/utilities.module';

// @Module({
//   controllers: [MovimientoCajaController],
//   providers: [
//     MovimientoCajaService,
//     PrismaService,
//     UtilidadesService,
//     CajaService,
//   ],
// })
// export class MovimientoCajaModule {}

@Module({
  imports: [
    CajaModule,
    PrismaModule,
    UtilitiesModule, // 🔥 ESTE TE FALTA
  ],
  controllers: [MovimientoCajaController],
  providers: [MovimientoCajaService],
})
export class MovimientoCajaModule {}
