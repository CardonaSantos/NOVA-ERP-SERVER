import { Module } from '@nestjs/common';
import { CuentaContableService } from './app/cuenta-contable.service';
import { CuentaContableController } from './presentation/cuenta-contable.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CUENTA_CONTABLE_REPOSITORY } from './domain/cuenta-contable.repository';
import { PrismaCuentaContableRepository } from './infraestructure/prisma-cuenta-contable.repository';

@Module({
  imports: [PrismaModule],
  controllers: [CuentaContableController],
  providers: [
    CuentaContableService,
    {
      provide: CUENTA_CONTABLE_REPOSITORY,
      useClass: PrismaCuentaContableRepository,
    },
  ],
})
export class CuentaContableModule {}
