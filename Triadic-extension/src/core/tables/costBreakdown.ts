import { baselineFor, previousKindName } from "../domain/kinds";
import { amountToYen, checkedYen } from "../domain/amounts";
import { isKindId, resolvedAmount, type KindId, type PreviousKind } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import type { TablePeriod } from "./periodTables";

export type CostBreakdownTarget = { kind: "account" | "group"; id: number; column: number; period: TablePeriod; displayPrevious?: PreviousKind };
export type CostBreakdownLine = {
  key: string; initiativeId: number | null; name: string; accountId: number;
  departmentId: number | null; industryId: number | null; sign: number; amount: number;
};

export type CostBreakdownSort = {
  column: "name" | "account" | "department" | "industry" | "sign" | "amount";
  direction: "ascending" | "descending";
};
const nameOrder = new Intl.Collator("ja", { numeric: true });

/** Sort the entire detail by displayed names or unrounded numeric values, without changing its source. */
export function sortCostBreakdownLines(lines: CostBreakdownLine[], contents: PlanContents, sort: CostBreakdownSort | null) {
  if (!sort) return lines;
  const { column, direction } = sort;
  const names = column === "account" ? new Map(contents.accounts.map(item => [item.id, item.displayName ?? item.accountName]))
    : column === "department" ? new Map(contents.departments.map(item => [item.id, item.departmentName]))
    : column === "industry" ? new Map(contents.industries.map(item => [item.id, item.industryName])) : new Map<number, string>();
  const label = (line: CostBreakdownLine) => column === "name" ? line.name
    : names.get((column === "account" ? line.accountId : column === "department" ? line.departmentId : line.industryId)!) ?? "";
  const order = direction === "ascending" ? 1 : -1;
  return [...lines].sort((left, right) => order * (column === "amount" || column === "sign"
    ? left[column] - right[column] : nameOrder.compare(label(left), label(right))));
}

/** A display snapshot can reuse candidates across periods, columns and reopen. */
export function indexCostBreakdown(contents: Pick<PlanContents, "previousAmounts" | "initiatives">) {
  const { previousAmounts, initiatives: sourceInitiatives } = contents;
  let previous: Map<string, { position: number; record: PlanContents["previousAmounts"][number] }[]> | undefined;
  let initiatives: Map<number, { position: number; initiative: PlanContents["initiatives"][number]; row: PlanContents["initiatives"][number]["rows"][number]; index: number }[]> | undefined;
  return {
    previous(accounts: Iterable<number>, kind: number, months: readonly number[]) {
      if (!previous) {
        previous = new Map();
        previousAmounts.forEach((record, position) => {
          const key = `${record.previousKind}:${record.accountId}:${record.month}`;
          if (!previous!.has(key)) previous!.set(key, []);
          previous!.get(key)!.push({ position, record });
        });
      }
      return [...accounts].flatMap(account => months.flatMap(month => previous!.get(`${kind}:${account}:${month}`) ?? []))
        .sort((left, right) => left.position - right.position).map(item => item.record);
    },
    initiatives(accounts: Iterable<number>) {
      if (!initiatives) {
        initiatives = new Map(); let position = 0;
        for (const initiative of sourceInitiatives) initiative.rows.forEach((row, index) => {
          const order = position++;
          if (row.accountId === null) return;
          if (!initiatives!.has(row.accountId)) initiatives!.set(row.accountId, []);
          initiatives!.get(row.accountId)!.push({ position: order, initiative, row, index });
        });
      }
      return [...accounts].flatMap(account => initiatives!.get(account) ?? []).sort((left, right) => left.position - right.position);
    },
  };
}

/** Use the same membership signs as the cost table, never account-attribute signs. */
export function buildCostBreakdown(contents: PlanContents, target: CostBreakdownTarget, selected: KindId[], candidates = indexCostBreakdown(contents)) {
  const kinds = [...selected].sort((a, b) => a - b);
  if (!kinds.length || target.column < 0 || target.column > 2 || (target.displayPrevious !== undefined && !isKindId(target.displayPrevious))) throw new Error("比較対象が正しくありません。");
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
  const prior = kinds.length === 1 && target.column === 0;
  const budget = kinds.length === 2 ? target.column < 2 : target.column === 1;
  const primaryDifference = kinds.length === 2 && target.column === 2;
  const kind = kinds[kinds.length === 2 && budget ? target.column : kinds.length - 1]!;
  const lines: CostBreakdownLine[] = [];
  const displayedDifference = kinds.length === 1 && target.column === 2 && target.displayPrevious !== undefined;
  if (prior || budget || primaryDifference || displayedDifference) {
    const baselines = displayedDifference
      ? baselineFor(contents, kind) === target.displayPrevious ? [] : [{ kind: baselineFor(contents, kind), factor: 1 }, { kind: target.displayPrevious!, factor: -1 }]
      : primaryDifference && baselineFor(contents, 1) === baselineFor(contents, 2) ? [] : primaryDifference ? [{ kind: baselineFor(contents, 2), factor: 1 }, { kind: baselineFor(contents, 1), factor: -1 }]
      : [{ kind: prior ? target.displayPrevious ?? baselineFor(contents, kind) : baselineFor(contents, kind), factor: 1 }];
    for (const baseline of baselines) {
    const previous = new Map<string, { line: Omit<CostBreakdownLine, "amount">; amount: bigint }>();
    for (const record of candidates.previous(signs.keys(), baseline.kind, target.period.months)) {
      const membership = signs.get(record.accountId);
      const sign = membership === undefined ? undefined : membership * baseline.factor;
      if (sign === undefined) continue;
      const amount = BigInt(amountToYen(record.amount)) * BigInt(sign);
      if (amount === 0n) continue;
      const key = `previous:${baseline.kind}:${baseline.factor}:${record.accountId}:${record.departmentId}:${record.industryId}`;
      const entry = previous.get(key) ?? { line: { key, initiativeId: null, name: previousKindName(baseline.kind), accountId: record.accountId,
        departmentId: record.departmentId, industryId: record.industryId, sign }, amount: 0n };
      entry.amount += amount;
      previous.set(key, entry);
    }
    for (const { line, amount } of previous.values()) lines.push({ ...line, amount: checkedYen(amount) });
    }
  }
  if (!prior) for (const { initiative, row, index } of candidates.initiatives(signs.keys())) {
    if (initiative.fiscalYear !== contents.fiscalYear) continue;
      const sign = row.accountId === null ? undefined : signs.get(row.accountId);
      if (sign === undefined) continue;
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
  }
  return { lines, total: checkedYen(lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)) };
}
