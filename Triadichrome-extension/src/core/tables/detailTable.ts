export const emptyDetailTable = () => Array.from({ length: 3 }, () => Array<string>(3).fill(""));

export function setTableCell(cells: string[][], row: number, column: number, value: string) {
  return cells.map((values, r) => r === row ? values.map((cell, c) => c === column ? value : cell) : values);
}

export function changeTableAxis(cells: string[][], axis: "row" | "column", index: number, remove: boolean) {
  if (remove && (axis === "row" ? cells.length : cells[0]!.length) === 1) return cells;
  if (axis === "row") return remove ? cells.filter((_, r) => r !== index)
    : [...cells.slice(0, index + 1), Array<string>(cells[0]!.length).fill(""), ...cells.slice(index + 1)];
  return cells.map(row => remove ? row.filter((_, c) => c !== index) : [...row.slice(0, index + 1), "", ...row.slice(index + 1)]);
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

export function pasteTableCells(cells: string[][], row: number, column: number, pasted: string[][]) {
  const width = Math.max(cells[0]!.length, column + Math.max(...pasted.map(values => values.length)));
  const height = Math.max(cells.length, row + pasted.length);
  return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
    const values = pasted[r - row];
    return values && c >= column && c < column + values.length ? values[c - column]! : cells[r]?.[c] ?? "";
  }));
}
