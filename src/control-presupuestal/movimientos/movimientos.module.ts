import { Module } from '@nestjs/common';
import { MovimientosController } from './presentation/movimientos.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MOVIMIENTO_REPOSITORY } from './domain/movimiento.repository';
import { PrismaMovimientoRepository } from './infraestructure/prisma-movimiento.repository';
import { MovimientosService } from './app/movimientos.service';

@Module({
  imports: [PrismaModule],
  controllers: [MovimientosController],
  providers: [
    MovimientosService,
    {
      provide: MOVIMIENTO_REPOSITORY,
      useClass: PrismaMovimientoRepository,
    },
  ],
  exports: [MovimientosService],
})
export class MovimientosModule {}
