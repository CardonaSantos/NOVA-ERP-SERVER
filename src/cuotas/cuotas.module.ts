import { Module } from '@nestjs/common';
import { CuotasService } from './cuotas.service';
import { CuotasController } from './cuotas.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { CajaModule } from 'src/caja/caja.module';
import { MetasService } from 'src/metas/metas.service';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';
import { MovimientoFinancieroModule } from 'src/movimiento-financiero/movimiento-financiero.module';

@Module({
  imports: [
    CajaModule,
    MovimientoFinancieroModule, // ✅ IMPORTA EL MÓDULO
  ],
  controllers: [CuotasController],
  providers: [CuotasService, PrismaService, MetasService],
})
export class CuotasModule {}
