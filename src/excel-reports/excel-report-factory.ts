import * as ExcelJS from 'exceljs';
import {
  applyWorkbookDefaults,
  autosizeColumns,
  bufferFromWorkbook,
  dateFmt,
  dateTimeFmt,
  freezeAndFilter,
  MaybeDate,
  moneyFmt,
  safeSheetName,
  styleHeaderRow,
  styleTitle,
  styleTotalsRow,
  toDate,
  toNumber,
} from './utils';

export interface ReportMeta {
  title: string;
  subtitle?: string;
}

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

export class ExcelReportFactory {
  createWorkbook() {
    const workbook = new ExcelJS.Workbook();
    applyWorkbookDefaults(workbook);
    return workbook;
  }

  createSheet(workbook: ExcelJS.Workbook, name: string, meta: ReportMeta) {
    const sheet = workbook.addWorksheet(safeSheetName(name), {
      properties: { defaultRowHeight: 18 },
      views: [{ showGridLines: true }],
    });
    styleTitle(sheet, meta.title, meta.subtitle);
    return sheet;
  }

  //   setColumns(sheet: ExcelJS.Worksheet, columns: ExcelColumnDef[]) {
  //     sheet.columns = columns.map((c) => ({
  //       header: c.header,
  //       key: c.key,
  //       width: c.width ?? 14,
  //     }));
  //   }
  setColumns(sheet: ExcelJS.Worksheet, columns: ExcelColumnDef[]) {
    sheet.columns = columns.map((c) => ({
      key: c.key,
      width: c.width ?? 14,
    }));

    const headerRow = sheet.getRow(4);

    columns.forEach((col, i) => {
      headerRow.getCell(i + 1).value = col.header;
    });

    headerRow.commit();
  }

  finalizeSheet(sheet: ExcelJS.Worksheet, headerRow = 4) {
    styleHeaderRow(sheet, headerRow);
    freezeAndFilter(sheet, headerRow, sheet.columnCount || 1);
    autosizeColumns(sheet);
  }

  moneyFormat(sheet: ExcelJS.Worksheet, keys: string[], currency = 'Q') {
    for (const key of keys) sheet.getColumn(key).numFmt = moneyFmt(currency);
  }

  dateFormat(sheet: ExcelJS.Worksheet, keys: string[], format = dateFmt()) {
    for (const key of keys) sheet.getColumn(key).numFmt = format;
  }

  dateTimeFormat(
    sheet: ExcelJS.Worksheet,
    keys: string[],
    format = dateTimeFmt(),
  ) {
    for (const key of keys) sheet.getColumn(key).numFmt = format;
  }

  async toBuffer(workbook: ExcelJS.Workbook) {
    return bufferFromWorkbook(workbook);
  }

  addTotalRow(
    sheet: ExcelJS.Worksheet,
    label: string,
    row: Record<string, unknown>,
    rowNumber?: number,
  ) {
    const added = sheet.addRow(row);
    if (rowNumber) {
      styleTotalsRow(sheet, rowNumber);
    } else {
      styleTotalsRow(sheet, added.number);
    }
    return added;
  }

  setWrap(sheet: ExcelJS.Worksheet, keys: string[]) {
    for (const key of keys) {
      sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' };
    }
  }

  writeDateCell(cell: ExcelJS.Cell, value: Date | null) {
    cell.value = value;
  }

  writeNumberCell(cell: ExcelJS.Cell, value: unknown) {
    cell.value = toNumber(value);
  }

  writeTextCell(cell: ExcelJS.Cell, value: unknown) {
    cell.value = value == null ? '' : String(value);
  }

  writeDate(value: MaybeDate) {
    return toDate(value);
  }
}
