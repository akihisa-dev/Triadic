import { accountEffectsYen } from "../domain/accountEffects";
import { amountToYen, checkedYen } from "../domain/amounts";
import { resolvedAmount, type KindId } from "../domain/kinds";
import { initiativeMonths, type InitiativeMonth } from "../domain/calendar";
import type { Initiative } from "../domain/plan";
import type { Account } from "../domain/accountMaster";
/** Resolve account rows without computing display-specific initiative totals. */
export function initiativeRowsForKind(initiative: Initiative, kind: KindId) {
  return initiative.rows.map(row => ({ ...row, amounts: Object.fromEntries(initiativeMonths.map(month => [month, resolvedAmount(row, kind, month)])) }));
}
type MonthlyMetrics = NonNullable<Initiative["months"][InitiativeMonth]>;
export type InitiativeForMetrics<K extends keyof MonthlyMetrics> = Omit<Initiative, "months"> & {
  months: Partial<Record<InitiativeMonth, Pick<MonthlyMetrics, K>>>;
};
/** Validate only the metrics needed by this table; exact intermediate sums stay in BigInt. */
export function initiativesForKind<K extends keyof MonthlyMetrics = keyof MonthlyMetrics>(
  initiatives: Initiative[], accounts: Account[], kind: KindId,
  metrics?: readonly K[],
): InitiativeForMetrics<K>[] {
  const attributes = new Map(accounts.map(account => [account.id, account.accountType]));
  return initiatives.map(initiative => {
    const rows = initiativeRowsForKind(initiative, kind);
    const months: InitiativeForMetrics<K>["months"] = {};
    for (const month of initiativeMonths) {
      let salesYen = 0n, expenseYen = 0n, profitYen = 0n;
      for (const row of rows) {
        const attribute = row.accountId === null ? null : attributes.get(row.accountId);
        const effects = accountEffectsYen(amountToYen(row.amounts[month] || "0"), attribute);
        salesYen += BigInt(effects.sales); expenseYen += BigInt(effects.expense); profitYen += BigInt(effects.profit);
      }
      const exact = { sales: salesYen, expense: expenseYen, profit: profitYen };
      const selected = metrics ?? (["sales", "expense", "profit"] as K[]);
      months[month] = Object.fromEntries(selected.map(metric => [metric, checkedYen(exact[metric])])) as Pick<MonthlyMetrics, K>;
    }
    return { ...initiative, rows, months };
  });
}
