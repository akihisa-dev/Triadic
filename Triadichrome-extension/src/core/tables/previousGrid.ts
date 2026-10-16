import { initiativeMonths } from "../domain/calendar";
import type { PreviousInput } from "../domain/kinds";

import { gridBounds, normalizeGridAmount, clipboardGrid, type GridCell, type GridSelection } from "./grid";

/** Validate the whole rectangle before returning a new draft; never partially apply a paste. */
export function pastePreviousGrid(draft: PreviousInput, rowIds: (number | null)[], start: GridCell, text: string, selection?: GridSelection | null): PreviousInput {
  let lines = clipboardGrid(text);
  if (selection && !/[\t\r\n]/.test(text)) {
    const bounds = gridBounds(selection);
    start = { row: bounds.top, column: bounds.left };
    lines = Array.from({ length: bounds.bottom - bounds.top + 1 }, () => Array<string>(bounds.right - bounds.left + 1).fill(text));
  }
  const width = lines[0]!.length;
  if (lines.some(line => line.length !== width)) throw new Error("貼り付ける範囲の列数を揃えてください。");
  if (start.row < 0 || start.column < 0 || start.row + lines.length > rowIds.length || start.column + width > initiativeMonths.length) throw new Error("貼り付ける範囲が表の外にはみ出します。");
  const updates = new Map<number, Record<number, string>>();
  for (const [offset, line] of lines.entries()) {
    const id = rowIds[start.row + offset];
    if (id == null) throw new Error("小計・合計・利益率には貼り付けできません。科目行の範囲を選んでください。");
    const amounts: Record<number, string> = {};
    for (const [column, value] of line.entries()) amounts[initiativeMonths[start.column + column]!] = normalizeGridAmount(value);
    updates.set(id, amounts);
  }
  return { ...draft, rows: draft.rows.map(row => updates.has(row.accountId) ? { ...row, amounts: { ...row.amounts, ...updates.get(row.accountId) } } : row) };
}
export function fillPreviousGrid(draft: PreviousInput, rowIds: (number | null)[], selection: GridSelection, text: string): PreviousInput {
  const value = normalizeGridAmount(text);
  const bounds = gridBounds(selection);
  const selectedIds = new Set(rowIds.slice(bounds.top, bounds.bottom + 1).filter(id => id !== null));
  return { ...draft, rows: draft.rows.map(row => selectedIds.has(row.accountId) ? { ...row, amounts: { ...row.amounts,
    ...Object.fromEntries(initiativeMonths.slice(bounds.left, bounds.right + 1).map(month => [month, value])) } } : row) };
}
