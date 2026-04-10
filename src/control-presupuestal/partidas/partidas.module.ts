import { Module } from '@nestjs/common';
import { PartidasService } from './app/partidas.service';
import { PartidasController } from './presentation/partidas.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PARTIDA_REPOSITORY } from './domain/partida.repository';
import { PrismaPartidaRepository } from './infraestructure/prisma-partida.repository';

@Module({
  imports: [PrismaModule],
  controllers: [PartidasController],
  providers: [
    PartidasService,
    {
      provide: PARTIDA_REPOSITORY,
      useClass: PrismaPartidaRepository,
    },
  ],
})
export class PartidasModule {}
