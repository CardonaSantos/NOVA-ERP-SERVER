import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
  Res,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ExcelReportsService } from '../app/excel-reports.service';
import { CreateExcelReportDto } from '../dto/create-excel-report.dto';
import { UpdateExcelReportDto } from '../dto/update-excel-report.dto';
import { QueryReport } from '../dto/query';
import { Response } from 'express';
import { QueryReportCajas } from '../dto/query-cajas';

@Controller('excel-reports')
export class ExcelReportsController {
  private readonly logger = new Logger(ExcelReportsController.name);
  constructor(private readonly excelReportsService: ExcelReportsService) {}

  @Get('ping')
  ping() {
    return 'ok';
  }

  @Post('utilidad-ventas')
  async reporteUtilidad(@Body() dto: QueryReport, @Res() res: Response) {
    this.logger.log(`El query es:\n${JSON.stringify(dto, null, 2)}`);
    const buffer = await this.excelReportsService.reportUtilidad(dto);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="utilidad_reporte_${Date.now()}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post('ventas')
  async reporteVentas(@Body() dto: QueryReport, @Res() res: Response) {
    this.logger.log(`El query es:\n${JSON.stringify(dto, null, 2)}`);
    const buffer = await this.excelReportsService.reportVentas(dto);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte_ventas_${Date.now()}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post('cajas')
  async reporteCajas(@Body() dto: QueryReportCajas, @Res() res: Response) {
    const buffer = await this.excelReportsService.reportCajas(dto);
    this.logger.log(`El query es:\n${JSON.stringify(dto, null, 2)}`);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte_cajas_${Date.now()}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
