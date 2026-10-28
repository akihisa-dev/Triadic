import { accountEffectsYen } from "../domain/accountEffects";
import { amountToYen } from "../domain/amounts";
import { addYen, checkedYen } from "../domain/amounts";
import { buildCostTable } from "./costTable";
import { initiativesForKind, initiativeRowsForKind } from "./initiatives";
import { initiativeMonths } from "../domain/calendar";
import { type PlanContents } from "../domain/plan";
import { baselineFor, type KindId } from "../domain/kinds";
import { buildExpansionTable, totalInitiatives, type ExpansionSort, type ExpansionTotals, type ExpansionMonths } from "./expansionTable";

export type ClassificationFilter = { industries: number[] | null; departments: number[] | null };
export const allClassifications = (): ClassificationFilter => ({ industries: null, departments: null });
export function matchesClassification(filter: ClassificationFilter, industry: number | null | undefined, department: number | null | undefined): boolean {
  return (filter.industries === null || (industry != null && filter.industries.includes(industry))) && (filter.departments === null || (department != null && filter.departments.includes(department)));
}
export function filterPlan(contents: PlanContents, filter: ClassificationFilter): PlanContents {
  return { ...contents, initiatives: contents.initiatives.filter(item => matchesClassification(filter, item.industryId, item.departmentId)), previousAmounts: contents.previousAmounts.filter(item => matchesClassification(filter, item.industryId, item.departmentId)) };
}
export function previousByAccount(contents: PlanContents) {
  const result = new Map<number, Partial<Record<typeof initiativeMonths[number], number>>>();
  for (const account of contents.accounts) result.set(account.id, Object.fromEntries(initiativeMonths.map(month => [month, 0])));
  const exact = new Map(contents.accounts.map(account => [account.id, {} as Partial<Record<typeof initiativeMonths[number], bigint>>]));
  for (const record of contents.previousAmounts) {
    if (record.previousKind !== (contents.previousKind ?? 1)) continue;
    const row = exact.get(record.accountId)!;
    const month = record.month as typeof initiativeMonths[number];
    row[month] = (row[month] ?? 0n) + BigInt(amountToYen(record.amount));
  }
  for (const [id, values] of exact) for (const month of initiativeMonths) {
    result.get(id)![month] = checkedYen(values[month] ?? 0n);
  }
  return result;
}
export function buildKindCostTable(contents: PlanContents, selected: KindId[]) {
  const previous = previousByAccount({ ...contents, previousKind: baselineFor(contents, selected[0] ?? 1) });
  const kinds = selected.map(kind => buildCostTable(contents.accounts, contents.aggregations, contents.initiatives.map(initiative => ({ ...initiative, rows: initiativeRowsForKind(initiative, kind) })), contents.fiscalYear, previousByAccount({ ...contents, previousKind: baselineFor(contents, kind) })));
  const skeleton = kinds[0] ?? buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear, previous);
  return skeleton.map((row, index) => ({ ...row, values: [row.previous, ...kinds.map(rows => rows[index]!.budget)] }));
}
export function previousTotals(contents: PlanContents): ExpansionTotals {
  const accounts = new Map(contents.accounts.map(account => [account.id, account]));
  const exact = new Map(initiativeMonths.map(month => [month, { sales: 0n, profit: 0n }]));
  for (const record of contents.previousAmounts) {
    if (record.previousKind !== (contents.previousKind ?? 1)) continue;
    const effects = accountEffectsYen(amountToYen(record.amount), accounts.get(record.accountId)!.accountType);
    const totals = exact.get(record.month as typeof initiativeMonths[number])!;
    totals.sales += BigInt(effects.sales); totals.profit += BigInt(effects.profit);
  }
  return Object.fromEntries([...exact].map(([month, totals]) => [month, {
    sales: checkedYen(totals.sales), profit: checkedYen(totals.profit),
  }]));
}

export function combineTotals(left: ExpansionMonths, right: ExpansionMonths, sign = 1): ExpansionTotals {
  return Object.fromEntries(initiativeMonths.map(month => [month, {
    sales: left[month]?.sales === null || right[month]?.sales === null ? null : addYen(left[month]?.sales ?? 0, (right[month]?.sales ?? 0) * sign),
    profit: left[month]?.profit === null || right[month]?.profit === null ? null : addYen(left[month]?.profit ?? 0, (right[month]?.profit ?? 0) * sign),
  }]));
}
export function buildKindExpansionTable(contents: PlanContents, selected: KindId[], sort: ExpansionSort, options: { comparePrevious?: boolean } = {}) {
  const projections = selected.map(kind => initiativesForKind(contents.initiatives, contents.accounts, kind, ["sales", "profit"]));
  const indexes = projections.map(items => {
    const byId = new Map<number, (typeof items)[number]>();
    const byExpansion = new Map<number | null, (typeof items)[number][]>();
    for (const item of items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
      const members = byExpansion.get(item.expansionId) ?? [];
      members.push(item); byExpansion.set(item.expansionId, members);
    }
    return { byId, byExpansion };
  });
  const table = buildExpansionTable({ ...contents, initiatives: projections[0]! }, contents.fiscalYear, sort);
  const priors = selected.map(kind => previousTotals({ ...contents, previousKind: baselineFor(contents, kind) }));
  const compare = (values: ExpansionMonths[]) => selected.length === 2
    ? [...values, combineTotals(values[selected.indexOf(2)]!, values[selected.indexOf(1)]!, -1)] : values;
  const totals = projections.map(totalInitiatives);
  return {
    // The UI uses each baseline for filtered budgets, but never displays their difference.
    previous: options.comparePrevious === false ? priors : compare(priors),
    total: compare(totals.map((total, index) => combineTotals(priors[index]!, total))),
    changes: compare(totals),
    groups: table.groups.map(group => {
      const members = indexes.map(index => index.byExpansion.get(group.expansion.id) ?? []);
      return { ...group, values: compare(members.map(totalInitiatives)), initiatives: group.initiatives.map(item => ({
        ...item, values: compare(indexes.map(index => index.byId.get(item.id)!.months)),
      })) };
    }),
  };
}
