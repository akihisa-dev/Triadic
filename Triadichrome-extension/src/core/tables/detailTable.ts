import { tablePeriods } from "./periodTables";

export const detailTableMonths = tablePeriods.filter(period => period.months.length === 1);
/** Canonical rows are items; column 0 is the name, followed by the twelve fiscal months. */
export const emptyDetailTable = () => Array.from({ length: 3 }, () => Array<string>(detailTableMonths.length + 1).fill(""));

export function setTableCell(cells: string[][], row: number, column: number, value: string) {
  const values = cells[row];
  if (!values || column < 0 || column >= values.length || values[column] === value) return cells;
  const result = cells.slice();
  result[row] = values.slice(); result[row]![column] = value;
  return result;
}

export function changeTableItem(cells: string[][], index: number, remove: boolean) {
  if (remove && cells.length === 1) return cells;
  return remove ? cells.filter((_, r) => r !== index)
    : [...cells.slice(0, index + 1), Array<string>(cells[0]!.length).fill(""), ...cells.slice(index + 1)];
}

/** Spreadsheet clipboard text: quoted cells may contain tabs, newlines and escaped quotes. */
export function parseTableClipboard(text: string): string[][] {
  const rows: string[][] = [], row: string[] = [];
  let cell = "", quoted = false;
  const source = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === "\t") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push([...row]); row.length = 0; cell = ""; }
    else cell += char;
  }
  if (cell || row.length || !rows.length || !source.endsWith("\n")) { row.push(cell); rows.push(row); }
  return rows;
}

export function pasteTableCells(cells: string[][], item: number, column: number, pasted: string[][], horizontal: boolean): string[][] | null {
  let sourceWidth = 0;
  for (const row of pasted) sourceWidth = Math.max(sourceWidth, row.length);
  if (column + (horizontal ? sourceWidth : pasted.length) > detailTableMonths.length + 1) return null;
  const count = Math.max(cells.length, item + (horizontal ? pasted.length : sourceWidth));
  const result = Array.from({ length: count }, (_, r) => cells[r] ?? Array<string>(detailTableMonths.length + 1).fill(""));
  const touched = new Set<number>();
  pasted.forEach((row, r) => row.forEach((value, c) => {
    const targetRow = item + (horizontal ? r : c), targetColumn = column + (horizontal ? c : r);
    if (result[targetRow]![targetColumn] === value) return;
    if (!touched.has(targetRow)) { result[targetRow] = result[targetRow]!.slice(); touched.add(targetRow); }
    result[targetRow]![targetColumn] = value;
  }));
  return touched.size || count !== cells.length ? result : cells;
}
