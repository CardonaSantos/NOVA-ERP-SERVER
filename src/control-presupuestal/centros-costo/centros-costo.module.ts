import { Module } from '@nestjs/common';
import { CentrosCostoService } from './centros-costo.service';
import { CentrosCostoController } from './centros-costo.controller';

@Module({
  controllers: [CentrosCostoController],
  providers: [CentrosCostoService],
})
export class CentrosCostoModule {}
