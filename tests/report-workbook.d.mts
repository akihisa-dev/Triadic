import type ExcelJS from 'exceljs';
export function evaluator(workbook: ExcelJS.Workbook): (sheet: ExcelJS.Worksheet, address: string) => unknown;
