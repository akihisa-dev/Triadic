import { baselineFor, resolvedAmount, previousKindName, type KindId, type PreviousKind } from "../domain/kinds";
import { addYen, amountToYen, checkedYen, sumYen } from "../domain/amounts";
import type { PlanContents } from "../domain/plan";
import { tablePeriods } from "./periodTables";
import { initiativeMonths, type InitiativeMonth } from "../domain/calendar";
import { buildCostTable } from "./costTable";
import { combineTotals, previousTotals } from "./planTables";

type DisplayColumn = { id: string; label: string; previous: PreviousKind | null; selected: KindId[]; source: number; budget?: KindId; difference?: "previous" | "budget" };

/** Inputs are ordered from earliest to latest; only the latest is the minuend. */
export function latestComparisonPairs<T>(ordered: readonly T[]) {
  const latest = ordered.at(-1)!;
  return ordered.slice(0, -1).map(earlier => ({ latest, earlier }));
}

/** Amount columns stay independent; the latest displayed kind is compared with each earlier displayed kind. */
export function comparisonDisplayColumns(contents: PlanContents, selected: KindId[]): DisplayColumn[] {
  const kinds = [...selected].sort() as KindId[];
  const previous = contents.budgetPrevious?.display ?? 1;
  const name = (kind: KindId) => kind === 1 ? "一次予算" : "確定予算";
  const differences = latestComparisonPairs<KindId | "previous">(["previous", ...kinds]);
  return [
    { id: "previous", label: previousKindName(previous), previous, selected: [kinds[0]!], source: 0 },
    ...kinds.map((kind, index) => ({ id: String(kind), label: name(kind), previous: null, selected: kinds, source: kinds.length === 1 ? 1 : index, budget: kind })),
    ...differences.map(({ latest, earlier }): DisplayColumn => {
      const budget = latest as KindId;
      return earlier === "previous"
        ? { id: `${budget}-previous`, label: `${name(budget)}−前年`, previous: null, selected: [budget], source: 2, budget, difference: "previous" }
        : { id: `${budget}-${earlier}`, label: `${name(budget)}−${name(earlier)}`, previous: null, selected: [earlier, budget], source: 2, difference: "budget" };
    }),
  ];
}

/** Keep baseline and initiative sums exact until the displayed budget account amount is known. */
function displayedCostValues(contents: PlanContents, previousKind: PreviousKind, kind?: KindId) {
  const exact = new Map(contents.accounts.map(account => [account.id, {} as Partial<Record<InitiativeMonth, bigint>>]));
  const add = (accountId: number, month: InitiativeMonth, amount: string) => {
    const values = exact.get(accountId)!;
    values[month] = (values[month] ?? 0n) + BigInt(amountToYen(amount));
  };
  for (const record of contents.previousAmounts) if (record.previousKind === previousKind) add(record.accountId, record.month as InitiativeMonth, record.amount);
  if (kind !== undefined) for (const initiative of contents.initiatives) {
    if (initiative.fiscalYear !== contents.fiscalYear) continue;
    for (const row of initiative.rows) if (row.accountId !== null) for (const month of initiativeMonths) add(row.accountId, month, resolvedAmount(row, kind, month));
  }
  const amounts = new Map([...exact].map(([id, values]) => [id, Object.fromEntries(initiativeMonths.map(month => [month, checkedYen(values[month] ?? 0n)]))]));
  // Evaluate the existing account/group/ratio layout for this one amount column.
  // No hidden baseline, change, or comparison amount is passed to the evaluator.
  const rows = buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear, amounts);
  const sales = rows.find(row => row.kind === "group" && row.id === contents.aggregations.find(group => group.required === "sales")!.id)!;
  const profit = rows.find(row => row.kind === "group" && row.id === contents.aggregations.find(group => group.required === "ordinary")!.id)!;
  const total = (values: typeof sales.previous, months: readonly InitiativeMonth[]) => sumYen(months.map(month => values[month] ?? 0));
  return rows.map(({ kind, id, name, required, configured, previous }) => ({ kind, id, name, required, configured,
    values: Object.fromEntries(tablePeriods.map(period => {
      let value: number | undefined;
      if (configured) {
        if (kind !== "ratio") value = total(previous, period.months);
        else {
          const denominator = total(sales.previous, period.months), numerator = total(profit.previous, period.months);
          if (denominator !== 0) value = numerator / denominator * 100;
        }
      }
      return [period.id, value];
    })),
  }));
}

export function buildDisplayedCostComparison(contents: PlanContents, selected: KindId[]) {
  const kinds = [...selected].sort() as KindId[];
  const columns = comparisonDisplayColumns(contents, kinds);
  const prior = displayedCostValues(contents, contents.budgetPrevious?.display ?? 1);
  const budgets = new Map(kinds.map(kind => [kind, displayedCostValues(contents, baselineFor(contents, kind), kind)]));
  return { columns, labels: columns.map(column => column.label), rows: prior.map((row, index) => ({ ...row, values: columns.map(column => {
    if (column.previous !== null) return row.values;
    if (!column.difference) return budgets.get(column.budget!)![index]!.values;
    const latest = budgets.get(kinds.at(-1)!)![index]!.values;
    const earlier = column.difference === "previous" ? row.values : budgets.get(kinds[0]!)![index]!.values;
    return Object.fromEntries(tablePeriods.map(period => {
      const left = latest[period.id], right = earlier[period.id];
      return [period.id, left === undefined || right === undefined ? undefined : row.kind === "ratio" ? left - right : addYen(left, -right)];
    }));
  }) })) };
}

/** Expansion tables display previous-year values in the existing row, never as extra columns. */
export function displayedExpansionPrevious(contents: PlanContents, selected: KindId[]) {
  const previous = contents.budgetPrevious?.display ?? 1;
  const values = previousTotals({ ...contents, previousKind: previous });
  return { label: previousKindName(previous), values: [...selected.map(() => values), ...(selected.length === 2 ? [combineTotals(values, values, -1)] : [])] };
}
