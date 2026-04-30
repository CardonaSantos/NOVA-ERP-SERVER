import { Module } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { ComprasController } from './compras.controller';
import { RecepcionesModule } from './recepciones/recepciones.module';
import { ComprasPagosModule } from './cxp/compras-pagos/compras-pagos.module';
import { DocumentoModule } from './cxp/documento/documento.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProrrateoService } from 'src/prorrateo/prorrateo.service';
import { MovimientoFinancieroService } from 'src/movimiento-financiero/movimiento-financiero.service';
import { MovimientoFinancieroModule } from 'src/movimiento-financiero/movimiento-financiero.module';

@Module({
  controllers: [ComprasController],
  providers: [ComprasService, ProrrateoService],
  imports: [
    RecepcionesModule,
    ComprasPagosModule,
    DocumentoModule,
    PrismaModule,
    MovimientoFinancieroModule,
  ],
})
export class ComprasModule {}
