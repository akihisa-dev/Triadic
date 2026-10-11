import { amountToYen, yenToAmount } from "../domain/amounts";

export type GridCell = { row: number; column: number };
export type GridSelection = { anchor: GridCell; end: GridCell };
export function gridBounds(selection: GridSelection) {
  return { top: Math.min(selection.anchor.row, selection.end.row), bottom: Math.max(selection.anchor.row, selection.end.row),
    left: Math.min(selection.anchor.column, selection.end.column), right: Math.max(selection.anchor.column, selection.end.column) };
}
export function normalizeGridAmount(text: string): string {
  const value = text.trim();
  if (!value) return "0";
  // Accept Excel's thousands separators, but reject malformed grouping.
  if (value.includes(",") && !/^[+-]?\d{1,3}(,\d{3})+(\.\d{0,3})?$/.test(value)) throw new Error("金額の桁区切りが正しくありません。");
  return yenToAmount(amountToYen(value.replaceAll(",", "")));
}
/** Preserve empty cells and remove only the clipboard’s final line terminator. */
export function clipboardGrid(text: string): string[][] {
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map(line => line.split("\t"));
}
