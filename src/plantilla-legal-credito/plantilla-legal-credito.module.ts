import { Module } from '@nestjs/common';
import { PlantillaLegalCreditoService } from './app/plantilla-legal-credito.service';
import { PlantillaLegalCreditoController } from './presentation/plantilla-legal-credito.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PLANTILLA_LEGAL_CREDITO } from './domain/plantilla-legal.repository';
import { PrismaPlantillaLegal } from './infraestructure/prisma-plantilla-legal.repository';

@Module({
  imports: [PrismaModule],
  controllers: [PlantillaLegalCreditoController],
  providers: [
    PlantillaLegalCreditoService,
    {
      provide: PLANTILLA_LEGAL_CREDITO,
      useClass: PrismaPlantillaLegal,
    },
  ],
})
export class PlantillaLegalCreditoModule {}
