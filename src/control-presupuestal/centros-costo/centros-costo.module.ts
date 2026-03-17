import { Module } from '@nestjs/common';
import { CentrosCostoController } from './presentation/centros-costo.controller';
import { CentrosCostoService } from './app/centros-costo.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CENTRO_COSTO_REPOSITORY } from './domain/centro-costo.repository';
import { PrismaCentroCostoRepository } from './infraestructure/prisma-centro-costo.repository';

@Module({
  imports: [PrismaModule],
  controllers: [CentrosCostoController],
  providers: [
    CentrosCostoService,
    {
      provide: CENTRO_COSTO_REPOSITORY,
      useClass: PrismaCentroCostoRepository,
    },
  ],
})
export class CentrosCostoModule {}
