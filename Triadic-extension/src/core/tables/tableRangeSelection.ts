import { gridBounds, type GridSelection } from "./grid";

export const tableRangeInstructions = "矢印キーで先頭の金額から選択を開始。矢印で移動、Shift＋矢印で範囲選択、Ctrl／Command＋Cでコピー、Escで解除。";

export function moveTableRangeSelection(active: GridSelection | null, key: string, extend: boolean, rows: number, columns: number): GridSelection | null {
  if (!rows || !columns || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return active;
  if (!active) return { anchor: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
  const end = {
    row: Math.max(0, Math.min(rows - 1, active.end.row + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0))),
    column: Math.max(0, Math.min(columns - 1, active.end.column + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0))),
  };
  return { anchor: extend ? active.anchor : end, end };
}

export function describeTableRange(selection: GridSelection | null, describe: (row: number, column: number) => string): string {
  if (!selection) return "選択なし。";
  const bounds = gridBounds(selection);
  const cell = (row: number, column: number) => `${row + 1}行目・${column + 1}列目 ${describe(row, column)}`;
  const current = `現在 ${cell(selection.end.row, selection.end.column)}。`;
  const rows = bounds.bottom - bounds.top + 1, columns = bounds.right - bounds.left + 1;
  return `${current}選択 ${rows}行×${columns}列、${rows * columns}セル。${rows * columns > 1
    ? `範囲 ${cell(bounds.top, bounds.left)} から ${cell(bounds.bottom, bounds.right)}。` : ""}`;
}
