import { amountToYen, checkedYen, sumYen } from "../domain/amounts";
import { accountEffectsYen } from "../domain/accountEffects";
import { initiativeMonths } from "../domain/calendar";
import { baselineFor, resolvedAmount, type KindId } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";

type Metric = "sales" | "profit" | "expense";
export type AnalysisAmounts = { sales: number; profit: number; expense?: number };
export type AnalysisMonths = Record<number, AnalysisAmounts>;
export type AnalysisSeries = { previous: AnalysisMonths; budgets: { kind: KindId; previous: AnalysisMonths; months: AnalysisMonths }[] };
export type AnalysisGroup = AnalysisSeries & { id: number | null; name: string };
type ExactMonths = Map<number, Record<Metric, bigint>>;
const empty = (): ExactMonths => new Map(initiativeMonths.map(month => [month, { sales: 0n, profit: 0n, expense: 0n }]));
const add = (target: ExactMonths, month: number, values: ReturnType<typeof accountEffectsYen>) => {
  const entry = target.get(month)!;
  for (const metric of ["sales", "profit", "expense"] as const) entry[metric] += BigInt(values[metric]);
};
const output = (months: ExactMonths, includeExpense = false): AnalysisMonths => Object.fromEntries([...months].map(([month, values]) => [month,
  { sales: checkedYen(values.sales), profit: checkedYen(values.profit), ...(includeExpense ? { expense: checkedYen(values.expense) } : {}) }]));
export function analysisAnnual(months: AnalysisMonths): AnalysisAmounts {
  const sum = (metric: Metric) => sumYen(initiativeMonths.map(month => months[month]![metric] ?? 0));
  return { sales: sum("sales"), profit: sum("profit"), ...(months[initiativeMonths[0]]!.expense !== undefined ? { expense: sum("expense") } : {}) };
}

/** A single pass over each kind's account rows feeds all classifications. No prior is assigned to initiative-only masters. */
export function buildDashboardBreakdowns(contents: PlanContents, selected: KindId[]) {
  const attributes = new Map(contents.accounts.map(account => [account.id, account.accountType]));
  const create = (definitions: { id: number; name: string }[], includeExpense = false) => {
    const data = new Map<number | null, { id: number | null; name: string; previous: ExactMonths[]; budgets: ExactMonths[] }>(definitions.map(item => [item.id,
      { ...item, previous: selected.map(empty), budgets: selected.map(empty) }]));
    const get = (id: number | null | undefined) => {
      const key = id != null && data.has(id) ? id : null;
      if (!data.has(key)) data.set(key, { id: key, name: "未所属", previous: selected.map(empty), budgets: selected.map(empty) });
      return data.get(key)!;
    };
    return { get, finish: (): AnalysisGroup[] => [...data.values()].map(item => ({ id: item.id, name: item.name,
      previous: output(item.previous[0]!, includeExpense), budgets: item.budgets.map((delta, index) => ({ kind: selected[index]!, previous: output(item.previous[index]!, includeExpense), months: output(new Map(initiativeMonths.map(month => {
        const base = item.previous[index]!.get(month)!, change = delta.get(month)!;
        return [month, { sales: base.sales + change.sales, profit: base.profit + change.profit, expense: base.expense + change.expense }];
      })), includeExpense) })) })) };
  };
  const industries = create(contents.industries.map(item => ({ id: item.id, name: item.industryName })));
  const departments = create(contents.departments.map(item => ({ id: item.id, name: item.departmentName })));
  const expansions = create(contents.expansions.map(item => ({ id: item.id, name: item.expansionName })));
  const periods = create(contents.periodTypes.map(item => ({ id: item.id, name: item.periodName })));
  const categoryDefinitions = contents.expansionCategories.map(item => ({ id: item.id, name: item.categoryName }));
  const allowedCategories = new Map(contents.expansions.map(item => [item.id, new Set(item.categoryIds ?? [])]));
  const categoriesByExpansion = new Map<number | null, ReturnType<typeof create>>();
  const categoriesFor = (id: number | null) => {
    if (!categoriesByExpansion.has(id)) categoriesByExpansion.set(id, create(categoryDefinitions.filter(item => id !== null && allowedCategories.get(id)?.has(item.id))));
    return categoriesByExpansion.get(id)!;
  };
  const accounts = create(contents.accounts.filter(item => item.accountType === "expense").map(item => ({ id: item.id, name: item.accountName })), true);
  const cells = new Map<string, { department: number | null; industry: number | null; previous: ExactMonths[]; budgets: ExactMonths[] }>();
  const cell = (department: number | null, industry: number | null) => {
    const key = JSON.stringify([department, industry]);
    if (!cells.has(key)) cells.set(key, { department, industry, previous: selected.map(empty), budgets: selected.map(empty) });
    return cells.get(key)!;
  };
  for (const record of contents.previousAmounts) {

    const values = accountEffectsYen(amountToYen(record.amount), attributes.get(record.accountId));
    const targets = [industries.get(record.industryId), departments.get(record.departmentId), cell(record.departmentId, record.industryId)];
    if (attributes.get(record.accountId) === "expense") targets.push(accounts.get(record.accountId));
    selected.forEach((kind, index) => { if (record.previousKind === baselineFor(contents, kind)) for (const target of targets) add(target.previous[index]!, record.month, values); });
  }
  for (const initiative of contents.initiatives) {
    if (initiative.fiscalYear !== contents.fiscalYear) continue;
    const department = departments.get(initiative.departmentId), industry = industries.get(initiative.industryId);
    const expansion = expansions.get(initiative.expansionId);
    const targets = [department, industry, expansion, periods.get(initiative.periodTypeId), categoriesFor(expansion.id).get(initiative.expansionCategoryId), cell(department.id, industry.id)];
    for (const row of initiative.rows) for (let index = 0; index < selected.length; index++) for (const month of initiativeMonths) {
      const values = accountEffectsYen(amountToYen(resolvedAmount(row, selected[index]!, month) || "0"), row.accountId === null ? null : attributes.get(row.accountId));
      for (const target of targets) add(target.budgets[index]!, month, values);
      if (row.accountId !== null && attributes.get(row.accountId) === "expense") add(accounts.get(row.accountId).budgets[index]!, month, values);
    }
  }
  const finishedCells = new Map([...cells].map(([key, entry]) => [key, {
    previous: output(entry.previous[0]!), budgets: entry.budgets.map((values, index) => ({ kind: selected[index]!, previous: output(entry.previous[index]!), months: output(new Map(initiativeMonths.map(month => {
      const base = entry.previous[index]!.get(month)!, delta = values.get(month)!;
      return [month, { sales: base.sales + delta.sales, profit: base.profit + delta.profit, expense: base.expense + delta.expense }];
    }))) })),
  }]));
  return { industries: industries.finish(), departments: departments.finish(), expansions: expansions.finish(), periods: periods.finish(), categoriesByExpansion: new Map([...categoriesByExpansion].map(([id, groups]) => [id, groups.finish()])), accounts: accounts.finish(), cells: finishedCells };
}
export type DashboardBreakdowns = ReturnType<typeof buildDashboardBreakdowns>;

/** Geometry helpers also keep signed/zero and area fallback decisions consistent with accessible values. */
export function compositionMode(values: number[]): "empty" | "signed" | "area" {
  if (values.some(value => value < 0)) return "signed";
  return values.some(value => value > 0) ? "area" : "empty";
}
export function waterfallSteps(start: number, changes: number[]) {
  let running = BigInt(start);
  return changes.map(change => { const from = checkedYen(running); running += BigInt(change); return { from, to: checkedYen(running), change }; });
}

/** Squared areas avoid narrow strips while preserving every area's exact proportion. */
export function treemapTiles(values: number[], width: number, height: number) {
  const total = sumYen(values);
  if (total <= 0 || values.some(value => value < 0)) return [];
  const pending = values.map((value, index) => ({ index, area: value / total * width * height })).filter(item => item.area > 0).sort((a, b) => b.area - a.area);
  const result: { index: number; x: number; y: number; width: number; height: number }[] = [];
  let x = 0, y = 0, w = width, h = height;
  const worst = (row: typeof pending, side: number) => {
    if (!row.length) return Infinity;
    const sum = row.reduce((sum, item) => sum + item.area, 0);
    return Math.max(side * side * Math.max(...row.map(item => item.area)) / (sum * sum), sum * sum / (side * side * Math.min(...row.map(item => item.area))));
  };
  while (pending.length) {
    const row = [pending.shift()!];
    const side = Math.min(w, h);
    while (pending.length && worst([...row, pending[0]!], side) <= worst(row, side)) row.push(pending.shift()!);
    const area = row.reduce((sum, item) => sum + item.area, 0);
    if (w >= h) {
      const strip = area / h;
      let top = y;
      for (const item of row) { const size = item.area / strip; result.push({ index: item.index, x, y: top, width: strip, height: size }); top += size; }
      x += strip; w = Math.max(0, w - strip);
    } else {
      const strip = area / w;
      let left = x;
      for (const item of row) { const size = item.area / strip; result.push({ index: item.index, x: left, y, width: size, height: strip }); left += size; }
      y += strip; h = Math.max(0, h - strip);
    }
  }
  return result;
}
