import { amountToYen, checkedYen } from "../domain/amounts";
import { resolvedAmount, type KindId } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import type { TablePeriod } from "./periodTables";

export type CostBreakdownTarget = { kind: "account" | "group"; id: number; column: number; period: TablePeriod };
export type CostBreakdownLine = {
  key: string; initiativeId: number | null; name: string; accountId: number;
  departmentId: number | null; industryId: number | null; sign: number; amount: number;
};

/** Use the same membership signs as the cost table, never account-attribute signs. */
export function buildCostBreakdown(contents: PlanContents, target: CostBreakdownTarget, selected: KindId[]) {
  const kinds = [...selected].sort((a, b) => a - b);
  if (!kinds.length || target.column < 0 || target.column > kinds.length + (kinds.length === 2 ? 2 : 1)) throw new Error("比較対象が正しくありません。");
  const groups = new Map(contents.aggregations.map(group => [group.id, group]));
  const signs = new Map<number, number>();
  const pending = [{ kind: target.kind, id: target.id, sign: 1 }];
  const visited = new Set<number>();
  while (pending.length) {
    const item = pending.pop()!;
    if (item.kind === "account") { signs.set(item.id, item.sign); continue; }
    const group = groups.get(item.id);
    if (!group || visited.has(item.id)) throw new Error("集計の構成が正しくありません。");
    visited.add(item.id);
    if (!group.members.length) throw new Error("集計が未設定です。");
    for (const member of group.members) pending.push({ ...member, sign: item.sign * member.sign });
  }
  const prior = target.column === 0;
  const budget = target.column > 0 && target.column <= kinds.length;
  const primaryDifference = target.column === kinds.length + 2;
  const kind = kinds[budget ? target.column - 1 : kinds.length - 1]!;
  const months = new Set<number>(target.period.months);
  const lines: CostBreakdownLine[] = [];
  if (prior || budget) {
    const previous = new Map<string, { line: Omit<CostBreakdownLine, "amount">; amount: bigint }>();
    for (const record of contents.previousAmounts) {
      const sign = signs.get(record.accountId);
      if (sign === undefined || !months.has(record.month)) continue;
      const amount = BigInt(amountToYen(record.amount)) * BigInt(sign);
      if (amount === 0n) continue;
      const key = `previous:${record.accountId}:${record.departmentId}:${record.industryId}`;
      const entry = previous.get(key) ?? { line: { key, initiativeId: null, name: "前年", accountId: record.accountId,
        departmentId: record.departmentId, industryId: record.industryId, sign }, amount: 0n };
      entry.amount += amount;
      previous.set(key, entry);
    }
    for (const { line, amount } of previous.values()) lines.push({ ...line, amount: checkedYen(amount) });
  }
  if (!prior) for (const initiative of contents.initiatives) {
    if (initiative.fiscalYear !== contents.fiscalYear) continue;
    initiative.rows.forEach((row, index) => {
      const sign = row.accountId === null ? undefined : signs.get(row.accountId);
      if (sign === undefined) return;
      let amount = 0n, active = false;
      for (const month of target.period.months) {
        const value = BigInt(amountToYen(resolvedAmount(row, kind, month)))
          - (primaryDifference ? BigInt(amountToYen(resolvedAmount(row, 1, month))) : 0n);
        active ||= value !== 0n;
        amount += value * BigInt(sign);
      }
      if (active) lines.push({ key: `initiative:${initiative.id}:${index}`, initiativeId: initiative.id,
        name: `${initiative.name}（${index + 1}行目）`, accountId: row.accountId!,
        departmentId: initiative.departmentId ?? null, industryId: initiative.industryId ?? null, sign, amount: checkedYen(amount) });
    });
  }
  return { lines, total: checkedYen(lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)) };
}
