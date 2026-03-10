import { Module } from '@nestjs/common';
import { ExcelReportsService } from './app/excel-reports.service';
import { ExcelReportsController } from './presentation/excel-reports.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { REPORT_REPOSITORY } from './domain/reports.repository';
import { PrismaReportsRepository } from './infraestructure/prisma-reports.repository';

@Module({
  imports: [PrismaModule],
  controllers: [ExcelReportsController],
  providers: [
    ExcelReportsService,
    {
      provide: REPORT_REPOSITORY,
      useClass: PrismaReportsRepository,
    },
  ],
})
export class ExcelReportsModule {}
