import { addYen, sumYen } from "../domain/amounts";
import { initiativeMonths, type InitiativeMonth } from "../domain/calendar";
import { baselineFor, type KindId, type PreviousKind } from "../domain/kinds";
import type { Initiative, PlanContents } from "../domain/plan";
import { totalInitiatives, type ExpansionMonths } from "./expansionTable";
import { initiativesForKind } from "./initiatives";
import { combineTotals, previousTotals } from "./planTables";

export type DashboardMetric = "sales" | "profit";
export type DashboardPeriod = "annual" | InitiativeMonth;
export type DashboardAmounts = { sales: number; profit: number; margin: number | undefined };
export type DashboardSeries = { previous: ExpansionMonths; budgets: { kind: KindId; previousKind: PreviousKind; previous: ExpansionMonths; months: ExpansionMonths }[] };
export function dashboardAmounts(months: ExpansionMonths, period: DashboardPeriod = "annual"): DashboardAmounts {
  const selected = period === "annual" ? initiativeMonths : [period];
  const amount = (metric: DashboardMetric) => {
    if (selected.some(month => months[month]?.[metric] === null)) throw new Error("属性未設定のため収支を計算できません。");
    return sumYen(selected.map(month => months[month]?.[metric] ?? 0));
  };
  const sales = amount("sales"), profit = amount("profit");
  return { sales, profit, margin: sales === 0 ? undefined : profit / sales * 100 };
}
/** A non-positive baseline has no meaningful growth percentage. Keep the absolute difference. */
export function dashboardChange(value: number, previous: number) {
  return { amount: addYen(value, -previous), rate: previous > 0 ? (value / previous - 1) * 100 : undefined };
}
export function buildDashboard(contents: PlanContents, selected: KindId[]) {
  const initiatives = contents.initiatives.filter(item => item.fiscalYear === contents.fiscalYear);
  const projections = selected.map(kind => ({ kind, items: initiativesForKind(initiatives, contents.accounts, kind, ["sales", "profit"]) }));
  const previousFor = (kind: KindId, context = contents) => previousTotals({ ...context, previousKind: baselineFor(contents, kind) });
  const previous = previousFor(selected[0]!);
  const series: DashboardSeries = { previous, budgets: projections.map(({ kind, items }) => ({ kind, previousKind: baselineFor(contents, kind), previous: previousFor(kind), months: combineTotals(previousFor(kind), totalInitiatives(items)) })) };
  const departments = contents.departments.map(item => ({ id: item.id as number | null, name: item.departmentName }));
  if (initiatives.some(item => item.departmentId == null)) departments.push({ id: null, name: "未所属" });
  return {
    ...series,
    departments: departments.map(department => {
      const prior = (kind: KindId) => department.id === null ? {} : previousFor(kind, { ...contents, previousAmounts: contents.previousAmounts.filter(item => item.departmentId === department.id) });
      const previous = prior(selected[0]!);
      return { ...department, previous, budgets: projections.map(({ kind, items }) => ({ kind, previousKind: baselineFor(contents, kind), previous: prior(kind),
        months: combineTotals(prior(kind), totalInitiatives(items.filter(item => (item.departmentId ?? null) === department.id))),
      })) };
    }),
    initiatives: projections.map(({ kind, items }) => ({ kind, items })),
  };
}
export type Dashboard = ReturnType<typeof buildDashboard>;
export type DashboardRank = { initiative: Initiative; amount: number; values: { kind: KindId; amount: number }[] };
export function rankDashboardInitiatives(dashboard: Dashboard, kind: KindId, period: DashboardPeriod, metric: DashboardMetric, direction: "increase" | "decrease"): DashboardRank[] {
  const indexes = dashboard.initiatives.map(entry => ({ kind: entry.kind, amounts: new Map(entry.items.map(item => [item.id, dashboardAmounts(item.months, period)[metric]])) }));
  const amounts = indexes.find(entry => entry.kind === kind)?.amounts;
  return (dashboard.initiatives.find(entry => entry.kind === kind)?.items ?? []).flatMap(initiative => {
    const amount = amounts!.get(initiative.id)!;
    if (direction === "increase" ? amount <= 0 : amount >= 0) return [];
    return [{ initiative, amount, values: indexes.map(entry => ({ kind: entry.kind, amount: entry.amounts.get(initiative.id)! })) }];
  }).sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount) || left.initiative.id - right.initiative.id);
}

export { buildDashboardBreakdowns, analysisAnnual, compositionMode, waterfallSteps, treemapTiles } from "./dashboardBreakdowns";
