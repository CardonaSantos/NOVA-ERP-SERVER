import { Module } from '@nestjs/common';
import { PresupuestosService } from './app/presupuestos.service';
import { PresupuestosController } from './presentation/presupuestos.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PRESUPUESTO_REPOSITORY } from './domain/presupuesto.repository';
import { PrismaPresupuestoRepository } from './infraestructure/prisma-presupuesto.repository';
import { MovimientosModule } from '../movimientos/movimientos.module';

@Module({
  imports: [PrismaModule, MovimientosModule],
  controllers: [PresupuestosController],
  providers: [
    PresupuestosService,
    {
      provide: PRESUPUESTO_REPOSITORY,
      useClass: PrismaPresupuestoRepository,
    },
  ],
})
export class PresupuestosModule {}
