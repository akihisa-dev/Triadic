import { baselineFor, previousKindName, type KindId, type PreviousKind } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import { buildPeriodCostComparison } from "./periodTables";
import { previousTotals } from "./planTables";

/** Visible columns retain each selected previous-year value, independently of budget count. */
export function comparisonDisplayColumns(contents: PlanContents, selected: KindId[]) {
  const kinds = [...selected].sort() as KindId[];
  const priors = [...new Set(kinds.map(kind => baselineFor(contents, kind)))].sort() as PreviousKind[];
  return [
    ...priors.map(previous => ({ id: `previous-${previous}`, label: previousKindName(previous), previous, selected: [kinds.find(kind => baselineFor(contents, kind) === previous)!], source: 0 })),
    ...kinds.map((kind, index) => ({ id: String(kind), label: kind === 1 ? "一次予算" : "確定予算", previous: null, selected: kinds, source: kinds.length === 1 ? 1 : index })),
    { id: "difference", label: kinds.length === 1 ? "前年差" : "差額", previous: null, selected: kinds, source: 2 },
  ];
}

/** Keep period aggregation, rates and breakdowns on the same original-yen calculation paths. */
export function buildDisplayedCostComparison(contents: PlanContents, selected: KindId[]) {
  const columns = comparisonDisplayColumns(contents, selected);
  const base = buildPeriodCostComparison(contents, selected);
  const priors = new Map(columns.filter(column => column.previous !== null).map(column => [column.previous!,
    selected.length === 1 ? base : buildPeriodCostComparison({ ...contents, initiatives: [] }, column.selected)]));
  return { columns, labels: columns.map(column => column.label), rows: base.rows.map((row, index) => ({ ...row,
    values: columns.map(column => column.previous === null ? row.values[column.source]! : priors.get(column.previous)!.rows[index]!.values[0]!),
  })) };
}

export function displayedExpansionPriors(contents: PlanContents, selected: KindId[]) {
  return comparisonDisplayColumns(contents, selected).filter(column => column.previous !== null).map(column => ({
    id: column.id, label: column.label, values: previousTotals({ ...contents, previousKind: column.previous! }),
  }));
}
