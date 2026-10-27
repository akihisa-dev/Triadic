import { baselineFor, comparisonName, previousKindName } from "../domain/kinds";
import { addYen } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import type { KindId } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import { buildKindCostTable } from "./planTables";

/** Display budgets in business order, with differences calculated before rounding. */
export function buildCostComparison(contents: PlanContents, selected: KindId[]) {
  const kinds = [...selected].sort((left, right) => left - right);
  const rows = buildKindCostTable(contents, kinds);
  const labels = kinds.length === 2 ? [...kinds.map(kind => comparisonName(contents, kind)), "差額\n確定予算 − 一次予算"] : [previousKindName(baselineFor(contents, kinds[0]!)), comparisonName(contents, kinds[0]!), "前年差"];
  return { labels, rows: rows.map(row => {
    const difference = (left: typeof row.previous, right: typeof row.previous) => Object.fromEntries(
      initiativeMonths.flatMap(month => left[month] === undefined || right[month] === undefined ? [] :
        [[month, row.kind === "ratio" ? left[month]! - right[month]! : addYen(left[month]!, -right[month]!)]]));
    const latest = row.values[row.values.length - 1]!;
    return { ...row, values: kinds.length === 2 ? [row.values[1]!, latest, difference(latest, row.values[1]!)] : [row.previous, latest, difference(latest, row.previous)] };
  }) };
}
