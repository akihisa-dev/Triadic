import type ExcelJS from 'exceljs';
type TableCell = { row: number; col: number; rowspan: number; colspan: number; text: string };
export function markupCells(markup: string): TableCell[];
export function workbookCells(sheet: ExcelJS.Worksheet, evaluate?: (sheet: ExcelJS.Worksheet, address: string) => unknown): TableCell[];
export function reportContractCells(cells: TableCell[], name: string, selected: number[], previous: Record<number, number>, expansionPrevious?: string[]): TableCell[];
