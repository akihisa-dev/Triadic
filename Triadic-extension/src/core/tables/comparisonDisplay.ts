import { previousKindName, type KindId, type PreviousKind } from "../domain/kinds";
import { addYen } from "../domain/amounts";
import type { PlanContents } from "../domain/plan";
import { buildPeriodCostComparison } from "./periodTables";
import { previousTotals } from "./planTables";

/** Previous-year display and each budget have separate selections. */
export function comparisonDisplayColumns(contents: PlanContents, selected: KindId[]) {
  const kinds = [...selected].sort() as KindId[];
  const previous = contents.budgetPrevious?.display ?? 1;
  return [
    { id: "previous", label: previousKindName(previous), previous: previous as PreviousKind | null, selected: [kinds[0]!], source: 0 },
    ...kinds.map((kind, index) => ({ id: String(kind), label: kind === 1 ? "一次予算" : "確定予算", previous: null as PreviousKind | null, selected: kinds, source: kinds.length === 1 ? 1 : index })),
    { id: "difference", label: kinds.length === 1 ? "前年差" : "差額", previous: null as PreviousKind | null, selected: kinds, source: 2 },
  ];
}

/** Aggregate displayed previous-year amounts separately, without recalculating either budget from them. */
export function buildDisplayedCostComparison(contents: PlanContents, selected: KindId[]) {
  const columns = comparisonDisplayColumns(contents, selected);
  const base = buildPeriodCostComparison(contents, selected);
  const previousKind = contents.budgetPrevious?.display ?? 1;
  const prior = buildPeriodCostComparison({ ...contents, initiatives: [], budgetPrevious: { 1: previousKind, 2: previousKind } }, [1]);
  return { columns, labels: columns.map(column => column.label), rows: base.rows.map((row, index) => {
    const previous = prior.rows[index]!.values[0]!;
    return { ...row, values: columns.map(column => {
      if (column.previous !== null) return previous;
      if (selected.length === 1 && column.source === 2) return Object.fromEntries(Object.keys(previous).map(period => {
        const budget = row.values[1]![period], before = previous[period];
        return [period, budget === undefined || before === undefined ? undefined : row.kind === "ratio" ? budget - before : addYen(budget, -before)];
      }));
      return row.values[column.source]!;
    }) };
  }) };
}

export function displayedExpansionPriors(contents: PlanContents, _selected: KindId[]) {
  const previous = contents.budgetPrevious?.display ?? 1;
  return [{ id: "previous", label: previousKindName(previous), values: previousTotals({ ...contents, previousKind: previous }) }];
}
