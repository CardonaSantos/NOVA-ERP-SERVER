import { Module } from '@nestjs/common';
import { PresupuestosService } from './app/presupuestos.service';
import { PresupuestosController } from './presentation/presupuestos.controller';

@Module({
  controllers: [PresupuestosController],
  providers: [PresupuestosService],
})
export class PresupuestosModule {}
