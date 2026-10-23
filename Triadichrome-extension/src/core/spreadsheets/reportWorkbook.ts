import { reportSourceSheet, reportSourceColumns, reportSourceColumn, reportSourceMonthColumn, reportSourceMonthColumns, reportSourceRange, reportSourceRow, reportSourceAmounts } from "./reportSourceColumns";
import { font, fill, sheet, finish, workbook } from "./workbookLayout";
import ExcelJS from "exceljs";
import { excelAmount } from "./excelAmounts";
import { installPreciseCalculations, type MonetaryCell } from "./reportPrecision";
import { initiativeMonths } from "../domain/calendar";
import { resolvedAmount, previousKindName, type PreviousSelections, type KindSelections } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import { buildPeriodCostComparison, tablePeriods, expansionPeriodAmount } from "../tables/periodTables";
import { buildKindExpansionTable, filterPlan, type ClassificationFilter } from "../tables/planTables";
import { createExpansionGrouping, groupExpansionCategories, groupExpansionPeriods } from "../tables/expansionTable";
import { initiativeTotals } from "../tables/initiativeTotals";
import { initiativesForKind } from "../tables/initiatives";
import { amountItems } from "../domain/amountItems";
import { accountEffectsYen } from "../domain/accountEffects";

export type ExportTable = "cost-table" | "expansion-table" | "initiative-list";
export type ExportOptions = { tables: ExportTable[]; selections: KindSelections; costFilter: ClassificationFilter; previousSelections?: PreviousSelections };
function periodStyles(ws: ExcelJS.Worksheet, start: number, width: number) {
  tablePeriods.forEach((period, index) => {
    if (period.months.length === 1) return;
    const color = period.months.length === 12 ? "FFC9C9C9" : period.months.length === 6 ? "FFDEDEDE" : "FFEBEBEB";
    for (let row = 3; row <= ws.rowCount; row++) for (let offset = 0; offset < width; offset++) {
      const cell = ws.getCell(row, start + index * width + offset);
      cell.fill = { ...fill, fgColor: { argb: color } };
      if (period.months.length >= 6) cell.font = { ...cell.font, bold: true };
      if (offset === 0) cell.border = { ...cell.border, left: { style: "medium", color: { argb: period.months.length === 12 ? "FF202020" : "FFA3A3A3" } } };
    }
  });
}

function indexReportMasters(contents: PlanContents) {
  return {
    accounts: new Map(contents.accounts.map(item => [item.id, item])),
    industries: new Map(contents.industries.map(item => [item.id, item])),
    departments: new Map(contents.departments.map(item => [item.id, item])),
    kinds: new Map(contents.kinds.map(item => [item.id, item])),
    expansions: new Map(contents.expansions.map(item => [item.id, item])),
    periods: new Map(contents.periodTypes.map(item => [item.id, item])),
    expansionCategories: new Map(contents.expansionCategories.map(item => [item.id, item])),
    aggregations: new Map(contents.aggregations.map(item => [item.id, item])),
  };
}
const lookup = <T,>(index: ReadonlyMap<number, T>, id: number | null | undefined) => id == null ? undefined : index.get(id);

/** Keep the original single source sheet; hidden identifiers avoid ambiguous names. */
function sources(wb: ExcelJS.Workbook, contents: PlanContents, filter: ClassificationFilter, masters: ReturnType<typeof indexReportMasters>) {
  const ws = wb.addWorksheet(reportSourceSheet);
  ws.addRow(reportSourceColumns.map(column => column.header));
  const included = (industry: number | null, department: number | null) =>
    (filter.industries === null || (industry !== null && filter.industries.includes(industry))) &&
    (filter.departments === null || (department !== null && filter.departments.includes(department)));
  const classified = new Map<string, typeof contents.previousAmounts>();
  for (const value of contents.previousAmounts) {
    const key = `${value.previousKind}:${value.industryId}:${value.departmentId}:${value.accountId}`;
    classified.set(key, [...classified.get(key) ?? [], value]);
  }
  for (const records of classified.values()) {
    const value = records[0]!;
    const account = masters.accounts.get(value.accountId);
    ws.addRow(reportSourceRow({ category: "前年", industry: masters.industries.get(value.industryId)?.industryName,
      department: masters.departments.get(value.departmentId)?.departmentName, initiative: "", kind: previousKindName(value.previousKind),
      accountCode: account?.accountCode, accountName: account?.accountName, accountType: account?.accountType,
      ...reportSourceAmounts(month => excelAmount(records.find(value => value.month === month)?.amount ?? "0")),
      accountId: value.accountId, initiativeId: 0, kindId: -value.previousKind, included: included(value.industryId, value.departmentId) ? 1 : 0 }));
  }
  for (const item of contents.initiatives.filter(i => i.fiscalYear === contents.fiscalYear)) {
    const industryName = lookup(masters.industries, item.industryId)?.industryName;
    const departmentName = lookup(masters.departments, item.departmentId)?.departmentName;
    for (const kind of [1, 2] as const) for (const input of item.rows) {
      const account = lookup(masters.accounts, input.accountId);
      ws.addRow(reportSourceRow({ category: "施策", industry: industryName,
        department: departmentName, initiative: item.name, kind: masters.kinds.get(kind)?.kindName,
        accountCode: account?.accountCode, accountName: account?.accountName, accountType: account?.accountType,
        ...reportSourceAmounts(month => excelAmount(resolvedAmount(input, kind, month))), accountId: input.accountId, initiativeId: item.id, kindId: kind,
        included: included(item.industryId ?? null, item.departmentId ?? null) ? 1 : 0 }));
    }
  }
  ws.columns.forEach((column, index) => {
    const role = reportSourceColumns[index]!.role;
    column.width = role === "description" ? 20 : 14;
    if (role === "amount") column.numFmt = '#,##0.###';
    if (role === "identifier") column.hidden = true;
  });
  ws.eachRow((row, index) => {
    if (index === 1) return;
    for (const column of reportSourceMonthColumns) {
      const cell = row.getCell(column);
      if (typeof cell.value === "string") cell.numFmt = "@";
    }
  });
  ws.views = [{ state: "frozen", xSplit: reportSourceMonthColumns[0]! - 1, ySplit: 1 }];
  ws.getRow(1).font = { ...font, bold: true }; ws.getRow(1).fill = fill;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, ws.rowCount), column: reportSourceMonthColumns.at(-1)! } };
  return { ws };
}
// Combine adjacent cells into ranges, preserving separated month blocks.
const sum = (refs: string[]) => {
  if (!refs.length) return "0";
  const ranges: string[] = [];
  for (let i = 0; i < refs.length; i++) {
    const start = refs[i]!; let end = start;
    while (i + 1 < refs.length) {
      const a = end.match(/^([A-Z]+)(\d+)$/), b = refs[i + 1]!.match(/^([A-Z]+)(\d+)$/);
      const column = (v: string) => [...v].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      if (!a || !b || !((a[1] === b[1] && Number(b[2]) === Number(a[2]) + 1) || (a[2] === b[2] && column(b[1]!) === column(a[1]!) + 1))) break;
      end = refs[++i]!;
    }
    ranges.push(start === end ? start : `${start}:${end}`);
  }
  // Each SUM, including the outer aggregation, stays within Excel's 255 arguments.
  let terms = ranges;
  while (terms.length > 255) {
    const grouped: string[] = [];
    for (let offset = 0; offset < terms.length; offset += 255) grouped.push(`SUM(${terms.slice(offset, offset + 255).join(",")})`);
    terms = grouped;
  }
  return `SUM(${terms.join(",")})`;
};

export function createReportWorkbook(contents: PlanContents, options: ExportOptions): ExcelJS.Workbook {
  if (!options.tables.length || new Set(options.tables).size !== options.tables.length || options.tables.some(t => !["cost-table", "expansion-table", "initiative-list"].includes(t))) throw new Error("出力する表を選択してください。");
  for (const [name, selected] of Object.entries(options.selections)) {
    if (!selected.length || selected.length > (name === "initiative-list" ? 1 : 2) || new Set(selected).size !== selected.length || selected.some(k => k !== 1 && k !== 2)) throw new Error("出力する種別が正しくありません。");
  }
  const previousSelections = options.previousSelections ?? { "cost-table": 1, "expansion-table": 1 };
  if ((["cost-table", "expansion-table"] as const).some(screen => previousSelections[screen] !== 1 && previousSelections[screen] !== 2)) throw new Error("基準前年が正しくありません。");
  const wb = workbook();
  const masters = indexReportMasters(contents);
  const monetary: MonetaryCell[] = [];
  const formula = (cell: ExcelJS.Cell, expression: string, result: number | string | undefined | null, money = false) => {
    if (result === undefined) { cell.value = null; return; }
    cell.value = { formula: expression, result: result ?? "属性未設定" };
    if (money) monetary.push({ cell, expression, yen: result as number | null });
  };
  const filtered = filterPlan({ ...contents, previousKind: previousSelections["cost-table"] }, options.costFilter);
  const expansionTable = options.tables.includes("expansion-table") ? buildKindExpansionTable({ ...contents, previousKind: previousSelections["expansion-table"] }, options.selections["expansion-table"], "registered") : null;
  const unfiltered = sources(wb, contents, options.costFilter, masters);
  const range = (col: number) => reportSourceRange(unfiltered.ws.getColumn(col).letter);
  const conditionalSum = (month: number, criteria: [number, number | string][]) =>
    `SUMIFS(${range(reportSourceMonthColumn(month as typeof initiativeMonths[number]))},${criteria.flatMap(([col, value]) => [range(col), typeof value === "number" ? String(value) : `"${value}"`]).join(",")})`;
  if (options.tables.includes("cost-table")) {
    const selected = [...options.selections["cost-table"]].sort((a, b) => a - b);
    const table = buildPeriodCostComparison(filtered, selected);
    const ws = sheet(wb, "総原価表", [25, ...tablePeriods.flatMap(() => table.labels.map(() => 10))], 2, 1);
    ws.getCell("A2").value = `${contents.fiscalYear}年度 · 単位：千円`;
    ws.mergeCells("A3:A4"); ws.getCell("A3").value = "科目・集計";
    const width = table.labels.length;
    tablePeriods.forEach((p, index) => {
      const start = 2 + index * width;
      ws.mergeCells(3, start, 3, start + width - 1); ws.getCell(3, start).value = p.label;
      table.labels.forEach((label, i) => { ws.getCell(4, start + i).value = label; });
    });
    const rowMap = new Map(table.rows.map((r, i) => [`${r.kind}:${r.id}`, i + 5]));
    const sales = table.rows.find(r => r.kind === "group" && r.id === contents.aggregations.find(g => g.required === "sales")?.id)!;
    const profit = table.rows.find(r => r.kind === "group" && r.id === contents.aggregations.find(g => g.required === "ordinary")?.id)!;
    const shaded = new Set<number>();
    table.rows.forEach((row, index) => {
      const r = index + 5;
      ws.getCell(r, 1).value = row.name + (row.configured ? "" : "\n未設定");
      if (row.kind !== "account") shaded.add(r);
      tablePeriods.forEach((period, pi) => row.values.forEach((values, vi) => {
        const col = 2 + pi * width + vi;
        const cell = ws.getCell(r, col);
        const value = values[period.id];
        const at = (ri: number, valueIndex = vi) => ws.getCell(ri, 2 + pi * width + valueIndex).address;
        let expression = "0";
        if (vi > selected.length) expression = `${at(r, selected.length)}-${at(r, vi === selected.length + 1 ? 0 : 1)}`;
        else if (row.kind === "ratio") {
          const denominator = at(rowMap.get(`group:${sales.id}`)!);
          expression = `IF(${denominator}=0,"",${at(rowMap.get(`group:${profit.id}`)!)}/${denominator}*100)`;
        } else if (period.months.length === 3) {
          const first = 2 + tablePeriods.findIndex(p => p.id === String(period.months[0])) * width;
          const last = 2 + tablePeriods.findIndex(p => p.id === String(period.months[2])) * width + width - 1;
          expression = `SUMIF(${ws.getCell(4, first).address}:${ws.getCell(4, last).address},${ws.getCell(4, col).address},${ws.getCell(r, first).address}:${ws.getCell(r, last).address})`;
        } else if (period.months.length > 3) {
          const size = period.months.length === 12 ? 6 : 3;
          expression = sum(tablePeriods.flatMap((p, index) => p.months.length === size && p.months.every(m => period.months.includes(m)) ? [ws.getCell(r, 2 + index * width + vi).address] : []));
        }
        else if (row.kind === "group") {
          const definition = masters.aggregations.get(row.id)!;
          expression = `${sum(definition.members.filter(m => m.sign === 1).map(m => at(rowMap.get(`${m.kind}:${m.id}`)!)))}-${sum(definition.members.filter(m => m.sign === -1).map(m => at(rowMap.get(`${m.kind}:${m.id}`)!)))}`;
        } else {
          const prior = conditionalSum(period.months[0]!, [[reportSourceColumn("accountId"), row.id], [reportSourceColumn("kindId"), -previousSelections["cost-table"]], [reportSourceColumn("included"), 1]]);
          expression = vi === 0 ? prior : `${prior}+${conditionalSum(period.months[0]!, [[reportSourceColumn("accountId"), row.id], [reportSourceColumn("kindId"), selected[vi - 1]!], [reportSourceColumn("included"), 1]])}`;
        }
        if (row.kind === "ratio" && vi > selected.length) expression = `IF(OR(${at(r, selected.length)}="",${at(r, vi === selected.length + 1 ? 0 : 1)}=""),"",${expression})`;
        formula(cell, expression, row.kind === "ratio" && row.configured ? value ?? "" : value, row.kind !== "ratio");
        if (row.kind === "ratio") cell.numFmt = vi > selected.length ? '[>=0.05]0.0"pt";[<=-0.05]-0.0"pt";""' : '[>=0.05]0.0"%";[<=-0.05]-0.0"%";""';
      }));
    });
    finish(ws, 4, shaded);
    periodStyles(ws, 2, width);
    const salesRow = rowMap.get(`group:${sales.id}`)!;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: salesRow }];
  }
  const effectFormula = (itemId: number | null, kind: number, month: number, metric: "sales" | "expense" | "profit") => {
    const attributes = ["sales", "cost", "expense", "profit"] as const;
    const parts = attributes.flatMap(attribute => {
      const sign = accountEffectsYen(1, attribute)[metric];
      if (!sign) return [];
      const criteria: [number, string | number][] = [[reportSourceColumn("kindId"), kind], [reportSourceColumn("accountType"), attribute]];
      if (itemId !== null) criteria.push([reportSourceColumn("initiativeId"), itemId]);
      return [`${sign < 0 ? "-" : "+"}${conditionalSum(month, criteria)}`];
    });
    return parts.join("").replace(/^\+/, "") || "0";
  };
  if (options.tables.includes("initiative-list")) {
    const kind = options.selections["initiative-list"][0]!;
    const ws = sheet(wb, "施策一覧", [17, 17, 34, 14, ...initiativeMonths.flatMap(() => [14, 14, 14])], 2, 4);
    ws.getCell("A2").value = `${contents.fiscalYear}年度 · 単位：千円 · ${masters.kinds.get(kind)!.kindName}`;
    for (const [col, name] of [[1, "展開名"], [2, "期間名"], [3, "施策名"], [4, "開始年月"]] as const) { ws.mergeCells(3, col, 4, col); ws.getCell(3, col).value = name; }
    initiativeMonths.forEach((m, mi) => { ws.mergeCells(3, 5 + mi * 3, 3, 7 + mi * 3); ws.getCell(3, 5 + mi * 3).value = `${m}月`; amountItems.map(item => item.name).forEach((s, i) => { ws.getCell(4, 5 + mi * 3 + i).value = s; }); });
    const items = initiativesForKind(contents.initiatives, contents.accounts, kind).filter(i => i.fiscalYear === contents.fiscalYear);
    items.forEach((item, index) => {
      const r = index + 5;
      ws.getCell(r, 1).value = lookup(masters.expansions, item.expansionId)?.expansionName ?? "";
      ws.getCell(r, 2).value = lookup(masters.periods, item.periodTypeId)?.periodName ?? "";
      ws.getCell(r, 3).value = item.name; ws.getCell(r, 4).value = item.startYearMonths[kind];
      initiativeMonths.forEach((m, mi) => amountItems.map(item => item.id).forEach((metric, i) => {
        const cell = ws.getCell(r, 5 + mi * 3 + i);
        formula(cell, effectFormula(item.id, kind, m, metric), item.months[m]?.[metric], true); cell.numFmt = '#,##0;-#,##0;0';
      }));
    });
    const total = initiativeTotals(items);
    const totalRow = items.length + 5;
    ws.mergeCells(totalRow, 1, totalRow, 4);
    ws.getCell(totalRow, 1).value = "合計";
    initiativeMonths.forEach((m, mi) => amountItems.map(item => item.id).forEach((metric, i) => {
      const cell = ws.getCell(totalRow, 5 + mi * 3 + i);
      formula(cell, effectFormula(null, kind, m, metric), total[m]?.[metric], true);
      cell.numFmt = '#,##0;-#,##0;0';
    }));
    finish(ws, 4, new Set([totalRow]));
  }
  if (options.tables.includes("expansion-table")) {
    const selected = options.selections["expansion-table"];
    const table = expansionTable!;
    const grouping = createExpansionGrouping(contents);
    const labels = [...selected.map(k => masters.kinds.get(k)!.kindName), ...(selected.length === 2 ? ["比較"] : [])];
    const width = labels.length * 2;
    const ws = sheet(wb, "展開表", [11, 11, 17, 34, ...tablePeriods.flatMap(() => labels.flatMap(() => [14, 14]))], 3, 4);
    ws.getCell("A2").value = `${contents.fiscalYear}年度 · 単位：千円`;
    ws.mergeCells("A3:A5"); ws.mergeCells("B3:B5"); ws.mergeCells("C3:C5"); ws.mergeCells("D3:D5"); ws.getCell("A3").value = "展開名"; ws.getCell("B3").value = "期間名"; ws.getCell("C3").value = "展開区分"; ws.getCell("D3").value = "施策名";
    tablePeriods.forEach((p, pi) => {
      const start = 5 + pi * width;
      ws.mergeCells(3, start, 3, start + width - 1); ws.getCell(3, start).value = p.label;
      labels.forEach((label, li) => { ws.mergeCells(4, start + li * 2, 4, start + li * 2 + 1); ws.getCell(4, start + li * 2).value = label; ws.getCell(5, start + li * 2).value = "売上"; ws.getCell(5, start + li * 2 + 1).value = "利益"; });
    });
    const shaded = new Set([7, 8]);
    const subtotals: number[] = [];
    let next = 9;
    const amountRow = (r: number, values: typeof table.total, monthly: (ki: number, metric: "sales" | "profit", month: number, col: number) => string) => {
      tablePeriods.forEach((p, pi) => values.forEach((value, ki) => (["sales", "profit"] as const).forEach((metric, mi) => {
        const col = 5 + pi * width + ki * 2 + mi;
        let expr: string;
        if (ki === selected.length) expr = `${ws.getCell(r, 5 + pi * width + selected.indexOf(2) * 2 + mi).address}-${ws.getCell(r, 5 + pi * width + selected.indexOf(1) * 2 + mi).address}`;
        else if (p.months.length === 3) {
          const first = 5 + tablePeriods.findIndex(t => t.id === String(p.months[0])) * width + ki * 2;
          const last = 5 + tablePeriods.findIndex(t => t.id === String(p.months[2])) * width + ki * 2 + 1;
          expr = `SUMIF(${ws.getCell(4, first).address}:${ws.getCell(4, last - 1).address},${ws.getCell(4, col - mi).address},${ws.getCell(r, first + mi).address}:${ws.getCell(r, last - 1 + mi).address})`;
        } else if (p.months.length > 3) {
          const size = p.months.length === 12 ? 6 : 3;
          expr = sum(tablePeriods.flatMap((t, index) => t.months.length === size && t.months.every(m => p.months.includes(m)) ? [ws.getCell(r, 5 + index * width + ki * 2 + mi).address] : []));
        }
        else expr = monthly(ki, metric, p.months[0]!, col);
        formula(ws.getCell(r, col), expr, expansionPeriodAmount(value, p, metric), true);
      })));
    };
    for (const group of table.groups) {
      const start = next;
      const members: number[] = [];
      for (const period of groupExpansionPeriods(group.initiatives, grouping.periods)) {
        const periodStart = next;
        for (const category of groupExpansionCategories(period.initiatives, grouping.categories)) {
          const categoryStart = next;
          for (const item of category.initiatives) {
          const r = next++; members.push(r);
          ws.getCell(r, 3).value = lookup(masters.expansionCategories, item.expansionCategoryId)?.categoryName ?? "";
          ws.getCell(r, 4).value = item.name;
          amountRow(r, item.values, (ki, metric, m) => effectFormula(item.id, selected[ki]!, m, metric));
          }
          if (categoryStart < next - 1) ws.mergeCells(categoryStart, 3, next - 1, 3);
        }
        ws.getCell(periodStart, 2).value = period.name;
        if (periodStart < next - 1) ws.mergeCells(periodStart, 2, next - 1, 2);
      }
      const r = next++; subtotals.push(r); shaded.add(r);
      ws.getCell(start, 1).value = group.expansion.expansionName;
      if (start < r) ws.mergeCells(start, 1, r, 1);
      ws.mergeCells(r, 2, r, 4);
      ws.getCell(r, 2).value = `${group.expansion.expansionName}計`;
      amountRow(r, group.values, (_, __, ___, col) => sum(members.map(ri => ws.getCell(ri, col).address)));
    }
    [previousKindName(previousSelections["expansion-table"]), "合計", "展開計"].forEach((label, i) => { ws.mergeCells(6 + i, 1, 6 + i, 4); ws.getCell(6 + i, 1).value = label; });
    amountRow(6, table.previous, (_, metric, m) => effectFormula(null, -previousSelections["expansion-table"], m, metric));
    amountRow(8, table.changes, (_, __, ___, col) => sum(subtotals.map(ri => ws.getCell(ri, col).address)));
    amountRow(7, table.total, (_, __, ___, col) => `${ws.getCell(6, col).address}+${ws.getCell(8, col).address}`);
    finish(ws, 5, shaded);
    periodStyles(ws, 5, width);
  }
  installPreciseCalculations(wb, monetary);
  // ExcelJS exposes orderNo for workbook tab ordering.
  (unfiltered.ws as ExcelJS.Worksheet & { orderNo: number }).orderNo = wb.worksheets.length;
  wb.worksheets.filter(s => s !== unfiltered.ws).forEach((s, i) => { (s as ExcelJS.Worksheet & { orderNo: number }).orderNo = i; });
  return wb;
}
