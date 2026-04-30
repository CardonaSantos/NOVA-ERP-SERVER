import * as ExcelJS from 'exceljs';

export type MaybeDate = Date | string | number | null | undefined;

export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const candidate = value as { toNumber?: () => number };
    if (typeof candidate.toNumber === 'function') return candidate.toNumber();
  }
  return Number(value) || 0;
}

export function toDate(value: MaybeDate): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function safeSheetName(name: string): string {
  return (
    name
      .replace(/[\\/?*\[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Hoja'
  );
}

export function moneyFmt(currency = 'Q'): string {
  return `"${currency}"#,##0.00;[Red]-"${currency}"#,##0.00`;
}

export function dateTimeFmt(): string {
  return 'dd/mm/yyyy hh:mm';
}

export function dateFmt(): string {
  return 'dd/mm/yyyy';
}

export function applyWorkbookDefaults(workbook: ExcelJS.Workbook) {
  workbook.creator = 'ERP';
  workbook.created = new Date();
  workbook.modified = new Date();
}

export function styleTitle(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle?: string,
) {
  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  if (subtitle) {
    sheet.mergeCells('A2:H2');
    const sub = sheet.getCell('A2');
    sub.value = subtitle;
    sub.font = { italic: true, size: 10 };
    sub.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
  }
}

export function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE9ECEF' },
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

export function styleTotalsRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'double' },
    };
  });
}

export function freezeAndFilter(
  sheet: ExcelJS.Worksheet,
  headerRow = 1,
  lastColumn = 1,
) {
  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  sheet.autoFilter = {
    from: `A${headerRow}`,
    to: sheet.getCell(headerRow, lastColumn).address,
  };
}

export function autosizeColumns(sheet: ExcelJS.Worksheet, min = 10, max = 45) {
  sheet.columns?.forEach((column) => {
    let width = min;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      const len = typeof v === 'string' ? v.length : String(v ?? '').length;
      width = Math.max(width, Math.min(max, len + 2));
    });
    column.width = width;
  });
}

export async function bufferFromWorkbook(
  workbook: ExcelJS.Workbook,
): Promise<Buffer> {
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw as ArrayBuffer);
}
