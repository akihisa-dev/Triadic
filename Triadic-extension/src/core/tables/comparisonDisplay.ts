import { previousKindName, type KindId, type PreviousKind } from "../domain/kinds";
import { addYen } from "../domain/amounts";
import type { PlanContents } from "../domain/plan";
import { buildPeriodCostComparison } from "./periodTables";
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

export function buildDisplayedCostComparison(contents: PlanContents, selected: KindId[]) {
  const kinds = [...selected].sort() as KindId[];
  const columns = comparisonDisplayColumns(contents, kinds);
  const base = buildPeriodCostComparison(contents, kinds);
  const previousKind = contents.budgetPrevious?.display ?? 1;
  const prior = buildPeriodCostComparison({ ...contents, initiatives: [], budgetPrevious: { 1: previousKind, 2: previousKind } }, [1]);
  return { columns, labels: columns.map(column => column.label), rows: base.rows.map((row, index) => {
    const previous = prior.rows[index]!.values[0]!;
    return { ...row, values: columns.map(column => {
      if (column.previous !== null) return previous;
      if (column.difference === "previous") return Object.fromEntries(Object.keys(previous).map(period => {
        const budget = row.values[kinds.length === 1 ? 1 : kinds.indexOf(column.budget!)]![period], before = previous[period];
        return [period, budget === undefined || before === undefined ? undefined : row.kind === "ratio" ? budget - before : addYen(budget, -before)];
      }));
      return row.values[column.source]!;
    }) };
  }) };
}

/** Expansion tables display previous-year values in the existing row, never as extra columns. */
export function displayedExpansionPrevious(contents: PlanContents, selected: KindId[]) {
  const previous = contents.budgetPrevious?.display ?? 1;
  const values = previousTotals({ ...contents, previousKind: previous });
  return { label: previousKindName(previous), values: [...selected.map(() => values), ...(selected.length === 2 ? [combineTotals(values, values, -1)] : [])] };
}
