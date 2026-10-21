import type ExcelJS from "exceljs";
import { amountToYen } from "../domain/amounts";
export type MonetaryCell = { cell: ExcelJS.Cell; expression: string; yen: number | null };
const columnNumber = (name: string) => [...name].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
export function roundedThousands(yen: number): number {
  const value = BigInt(yen), absolute = value < 0n ? -value : value;
  return Number((value < 0n ? -1n : 1n) * ((absolute + 500n) / 1000n));
}

/** Three signed integer pieces keep each SUM within Excel's 15 significant digits,
 * even at the worksheet row limit. Monetary arithmetic never uses rounded cells. */
export function installPreciseCalculations(wb: ExcelJS.Workbook, money: MonetaryCell[]): void {
  const source = wb.getWorksheet("計算元")!;
  const sourceColumn = (column: number, component: number) => 25 + component * 12 + column - 9;
  // Parse the integer part before converting text to numbers, preserving 1-yen
  // precision beyond Excel's 15 significant digits. No normalization formula cell.
  const height = source.rowCount;
  for (let column = 9; column <= 20; column++) {
    const address = `${source.getColumn(column).letter}2`;
    const signedText = `${address}&""`;
    const sign = `IF(LEFT(${signedText},1)="-",-1,1)`;
    const point = `FIND(".",${signedText}&".")`;
    const integer = `IF(ISNUMBER(${address}),INT(ABS(${address})),ABS(VALUE(IF(${address}="","0",LEFT(${signedText},${point}-1)))))`;
    const low = `IF(ISNUMBER(${address}),INT(MOD(ABS(${address})*1000,1000)+0.5),VALUE(LEFT(MID(${address},${point}+1,3)&"000",3)))`;
    const values = Array.from({ length: Math.max(0, height - 1) }, (_, index) => BigInt(amountToYen(String(source.getCell(index + 2, column).value ?? "0"))));
    for (let component = 0; component < 3; component++) {
      const helper = sourceColumn(column, component);
      source.getColumn(helper).hidden = true;
      source.getCell(1, helper).value = `${source.getCell(1, column).text}：円整数の分割${component + 1}`;
      if (height < 2) continue;
      const expression = component === 0 ? `INT(${integer}/1000000)` : component === 1 ? `MOD(${integer},1000000)` : low;
      const results = values.map(yen => Number(component === 0 ? yen / 1000000000n : component === 1 ? yen / 1000n % 1000000n : yen % 1000n));
      // Standard shared formulas store one expression per column while retaining
      // a normal, independently recalculated formula and cached result in every row.
      source.fillFormula(`${source.getCell(2, helper).address}:${source.getCell(height, helper).address}`, `${sign}*${expression}`, results);
    }
  }
  for (const ws of wb.worksheets.filter(sheet => sheet !== source)) {
    const width = ws.columnCount;
    const cells = money.filter(record => record.cell.worksheet === ws);
    const addresses = new Set(cells.map(record => record.cell.address));
    const ref = (cell: ExcelJS.Cell, component: number) => ws.getCell(Number(cell.row), Number(cell.col) + width * (component + 1)).address;
    const translate = (expression: string, component: number) => expression
      .replace(/'計算元'!\$([A-Z]+):\$([A-Z]+)/g, (match, first: string, last: string) => {
        const column = columnNumber(first);
        if (column < 9 || column > 20 || first !== last) return match;
        const helper = source.getColumn(sourceColumn(column, component)).letter;
        return `'計算元'!$${helper}:$${helper}`;
      })
      .replace(/(\$?)([A-Z]+)(\$?)(\d+)\b/g, (match, absoluteColumn: string, column: string, absoluteRow: string, row: string) =>
        addresses.has(`${column}${row}`) ? `${absoluteColumn}${ws.getColumn(columnNumber(column) + width * (component + 1)).letter}${absoluteRow}${row}` : match);
    const unrounded = (cell: ExcelJS.Cell) => {
      const [high, middle, low] = [0, 1, 2].map(component => ref(cell, component));
      return `(${high}*1000000+${middle}+INT(${low}/1000)+MOD(${low},1000)/1000)`;
    };
    // Ratios use original amounts; differences between ratios retain their original formulas.
    ws.eachRow(row => row.eachCell(cell => {
      if (!cell.formula || addresses.has(cell.address)) return;
      const expression = cell.formula.replace(/\b([A-Z]+\d+)\b/g, (match: string) => addresses.has(match) ? unrounded(ws.getCell(match)) : match);
      cell.value = { formula: expression, result: cell.result as number | string };
    }));
    for (let column = width + 1; column <= width * 4; column++) ws.getColumn(column).hidden = true;
    ws.pageSetup.printArea = `A1:${ws.getCell(ws.rowCount, width).address}`;
    for (const { cell, expression, yen } of cells) {
      for (let component = 0; component < 3; component++) {
        // Uncached intermediate formulas avoid publishing a differently normalized split.
        ws.getCell(ref(cell, component)).value = { formula: yen === null ? '"属性未設定"' : translate(expression, component) };
      }
      const [high, middle, low] = [0, 1, 2].map(component => ref(cell, component));
      const integer = `(${high}*1000000+${middle}+INT(${low}/1000))`;
      cell.value = { formula: yen === null ? '"属性未設定"' : `${integer}+INT((MOD(${low},1000)+IF(${integer}<0,499,500))/1000)`, result: yen === null ? "属性未設定" : roundedThousands(yen) };
    }
    splitLongSums(ws);
  }
}

/** Apply the length limit after column translation, which can lengthen references.
 * Each leaf SUM already has at most 255 cell/range arguments. Move those sums
 * into hidden cells until their parent expression fits Excel's separate limit. */
function splitLongSums(ws: ExcelJS.Worksheet): void {
  const limit = 8192;
  const height = ws.rowCount, firstColumn = ws.columnCount + 1;
  let next = 0;
  const helper = (formula: string) => {
    if (formula.length > limit) throw new Error("Excelの合計数式が長すぎます。");
    const column = firstColumn + Math.floor(next / height), row = next++ % height + 1;
    if (column > 16384) throw new Error("Excelの計算用列の上限を超えました。");
    ws.getColumn(column).hidden = true;
    const cell = ws.getCell(row, column);
    cell.value = { formula };
    return cell.address;
  };
  const long: ExcelJS.Cell[] = [];
  ws.eachRow(row => row.eachCell(cell => { if (cell.formula && cell.formula.length > limit) long.push(cell); }));
  for (const cell of long) {
    let formula = cell.formula;
    while (formula.length > limit) {
      const shorter = formula.replace(/SUM\([^()]*\)/g, helper);
      if (shorter.length >= formula.length) throw new Error("Excelの数式を上限内に分割できません。");
      formula = shorter;
    }
    cell.value = { formula, ...(cell.result === undefined ? {} : { result: cell.result as number | string }) };
  }
}
