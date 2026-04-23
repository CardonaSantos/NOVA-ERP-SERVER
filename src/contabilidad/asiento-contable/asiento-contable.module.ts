import { Module } from '@nestjs/common';
import { AsientoContableService } from './app/asiento-contable.service';
import { AsientoContableController } from './presentation/asiento-contable.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ASIENTO_CONTABLE_REPOSITORY } from './domain/domain.repository';
import { PrismaAsientoContableRepository } from './infraestructure/asiento-contable.prisma.repository';
//x xxx
@Module({
  imports: [PrismaModule],
  controllers: [AsientoContableController],
  providers: [
    AsientoContableService,
    {
      provide: ASIENTO_CONTABLE_REPOSITORY,
      useClass: PrismaAsientoContableRepository,
    },
  ],
  exports: [AsientoContableService],
})
export class AsientoContableModule {}
