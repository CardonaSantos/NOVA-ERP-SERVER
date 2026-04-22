import { Module } from '@nestjs/common';
import { ReglaContableService } from './app/regla-contable.service';
import { ReglaContableController } from './presentation/regla-contable.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { REGLA_CONTABLE_REPOSITORY } from './domain/regla-contable.repository';
import { PrismaReglaContableRepository } from './infraestructure/prisma-regla-contable.repository';

@Module({
  imports: [PrismaModule],
  controllers: [ReglaContableController],
  providers: [
    ReglaContableService,
    {
      provide: REGLA_CONTABLE_REPOSITORY,
      useClass: PrismaReglaContableRepository,
    },
  ],
})
export class ReglaContableModule {}
