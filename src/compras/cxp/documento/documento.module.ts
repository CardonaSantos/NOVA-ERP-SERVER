import { Module } from '@nestjs/common';
import { DocumentoService } from './documento.service';
import { DocumentoController } from './documento.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MovimientoFinancieroModule } from 'src/movimiento-financiero/movimiento-financiero.module';

@Module({
  imports: [
    PrismaModule,
    MovimientoFinancieroModule, // ✅ ESTE es el bueno
  ],
  controllers: [DocumentoController],
  providers: [DocumentoService],
})
export class DocumentoModule {}
