import { amountToYen, checkedYen } from "../domain/amounts";
import { amountItems, amountItemEffectsYen } from "../domain/amountItems";
import { initiativeMonths } from "../domain/calendar";
import { kindIds, resolvedAmount, type KindId } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import type { HistoryIncomeImpact, HistoryIncomeValue } from "../domain/historyDifference";

/** Sum raw inputs across the entire plan, without rounding or per-account/initiative overflow. */
function totals(contents: PlanContents, kind: KindId) {
  const attributes = new Map(contents.accounts.map(account => [account.id, account.accountType]));
  const months = new Map(initiativeMonths.map(month => [month as number, { sales: 0n, expense: 0n, profit: 0n }]));
  const add = (month: number, account: number | null, amount: string) => {
    const effect = amountItemEffectsYen(amountToYen(amount), attributes.get(account!));
    const target = months.get(month)!;
    for (const item of amountItems) target[item.id] += BigInt(effect[item.id]);
  };
  for (const previous of contents.previousAmounts) add(previous.month, previous.accountId, previous.amount);
  for (const initiative of contents.initiatives) {
    if (initiative.fiscalYear !== contents.fiscalYear) continue;
    for (const row of initiative.rows) for (const month of initiativeMonths) add(month, row.accountId, resolvedAmount(row, kind, month));
  }
  const year = { sales: 0n, expense: 0n, profit: 0n };
  for (const values of months.values()) for (const item of amountItems) year[item.id] += values[item.id];
  return { months, year };
}
function value(exact: bigint): HistoryIncomeValue {
  try { return { yen: checkedYen(exact) }; } catch { return { error: "範囲超過" }; }
}
export function compareHistoryIncome(before: PlanContents, after: PlanContents): HistoryIncomeImpact[] {
  return kindIds.flatMap(kind => {
    const left = totals(before, kind), right = totals(after, kind);
    return (["year", ...initiativeMonths] as const).flatMap(period => amountItems.map(item => {
      const old = (period === "year" ? left.year : left.months.get(period)!)[item.id];
      const next = (period === "year" ? right.year : right.months.get(period)!)[item.id];
      return { kind, period, metric: item.id, before: value(old), after: value(next), difference: value(next - old) };
    }));
  });
}
