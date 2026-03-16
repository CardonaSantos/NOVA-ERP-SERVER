import { Module } from '@nestjs/common';
import { AbonoCuotaService } from './abono-cuota.service';
import { AbonoCuotaController } from './abono-cuota.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MetasModule } from 'src/metas/metas.module';

@Module({
  imports: [PrismaModule, MetasModule],
  controllers: [AbonoCuotaController],
  providers: [AbonoCuotaService],
})
export class AbonoCuotaModule {}
