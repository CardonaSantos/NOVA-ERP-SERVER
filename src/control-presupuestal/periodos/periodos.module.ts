import { Module } from '@nestjs/common';
import { PeriodosService } from './app/periodos.service';
import { PeriodosController } from './presentation/periodos.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PERIODO_PRESUPUESTAL_REPOSITORY } from './domain/periodo.repository';
import { PrismaPeriodoPresupuestal } from './infraestructure/prisma-periodo-presupuestal.repository';

@Module({
  imports: [PrismaModule],
  controllers: [PeriodosController],
  providers: [
    PeriodosService,
    {
      provide: PERIODO_PRESUPUESTAL_REPOSITORY,
      useClass: PrismaPeriodoPresupuestal,
    },
  ],
})
export class PeriodosModule {}
