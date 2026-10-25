import { childFirstAggregations } from "../domain/aggregationOrder";
import { amountToYen, checkedYen, isValidAmount } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import type { PreviousInput } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import { buildCostTable, type CostRow } from "./costTable";

/** Reuse unaffected account/group rows while typing in one previous-year cell. */
export function previousGridCalculator(contents: Pick<PlanContents, "accounts" | "aggregations" | "fiscalYear">) {
  const { accounts, aggregations, fiscalYear } = contents;
  const empty = buildCostTable(accounts, aggregations, [], fiscalYear);
  const order = childFirstAggregations(aggregations);
  const parents = new Map<string, Set<number>>();
  for (const group of order) for (const member of group.members) {
    const key = `${member.kind}:${member.id}`;
    if (!parents.has(key)) parents.set(key, new Set());
    parents.get(key)!.add(group.id);
  }
  const numeric = new Map<number, CostRow["previous"]>();
  let inputs = new Map<number, PreviousInput["rows"][number]>();
  const invalid = new Set<number>();
  let current: CostRow[] | null = null;
  let last: PreviousInput["rows"] | undefined;
  let result = { rows: empty, calculationFailed: false };
  return (draft: PreviousInput) => {
    if (last === draft.rows) return result;
    const nextInputs = new Map(draft.rows.map(row => [row.accountId, row]));
    const changed = new Set<number>(), months = new Set<number>();
    for (const id of new Set([...inputs.keys(), ...nextInputs.keys()])) {
      const input = nextInputs.get(id);
      if (input === inputs.get(id)) continue;
      changed.add(id); invalid.delete(id);
      const values: CostRow["previous"] = {};
      if (input) for (const month of initiativeMonths) {
        const text = input.amounts[month] || "0";
        const valid = isValidAmount(text);
        if (!valid) invalid.add(id);
        values[month] = valid ? amountToYen(text) : 0;
      }
      for (const month of initiativeMonths) if (numeric.get(id)?.[month] !== values[month]) months.add(month);
      if (input) numeric.set(id, values); else numeric.delete(id);
    }
    inputs = nextInputs; last = draft.rows;
    try {
      if (!current) current = buildCostTable(accounts, aggregations, [], fiscalYear, numeric);
      else if (months.size) {
        const byKey = new Map(current.map(row => [`${row.kind}:${row.id}`, row]));
        const affected = new Set<number>();
        const collect = (key: string) => {
          const pending = [key];
          while (pending.length) for (const parent of parents.get(pending.pop()!) ?? []) {
            if (affected.has(parent)) continue;
            affected.add(parent); pending.push(`group:${parent}`);
          }
        };
        const replace = (row: CostRow, previous: CostRow["previous"]) => {
          if (initiativeMonths.every(month => row.previous[month] === previous[month])) return;
          const comparison = Object.fromEntries(initiativeMonths.flatMap(month => previous[month] === undefined ? [] : [[month, 0]]));
          byKey.set(`${row.kind}:${row.id}`, { ...row, previous, budget: { ...previous }, comparison });
        };
        for (const id of changed) {
          const row = byKey.get(`account:${id}`);
          if (row) { replace(row, numeric.get(id) ?? {}); collect(`account:${id}`); }
        }
        for (const group of order) if (affected.has(group.id)) {
          const row = byKey.get(`group:${group.id}`)!;
          if (!row.configured) continue;
          const values = { ...row.previous };
          for (const month of months as Set<(typeof initiativeMonths)[number]>) {
            let exact = 0n, present = false;
            for (const member of group.members) {
              const value = byKey.get(`${member.kind}:${member.id}`)!.previous[month];
              if (value !== undefined) { exact += BigInt(value) * BigInt(member.sign); present = true; }
            }
            if (present) values[month] = checkedYen(exact); else delete values[month];
          }
          replace(row, values);
        }
        const ratio = current.find(row => row.kind === "ratio")!;
        const sales = byKey.get(`group:${aggregations.find(group => group.required === "sales")!.id}`)!;
        const profit = byKey.get(`group:${aggregations.find(group => group.required === "ordinary")!.id}`)!;
        const values = { ...ratio.previous };
        for (const month of months as Set<(typeof initiativeMonths)[number]>) {
          const denominator = sales.previous[month], numerator = profit.previous[month];
          if (ratio.configured && denominator !== undefined && denominator !== 0 && numerator !== undefined) values[month] = numerator / denominator * 100;
          else delete values[month];
        }
        replace(ratio, values);
        current = current.map(row => byKey.get(`${row.kind}:${row.id}`)!);
      }
      result = { rows: current, calculationFailed: invalid.size > 0 };
    } catch {
      current = null; result = { rows: empty, calculationFailed: true };
    }
    return result;
  };
}
