import { initiativeMonths } from "./calendar";
import type { PlanContents } from "./plan";
import type { PreviousKind, PreviousInput } from "./kinds";
import type { PreviousAmount } from "./kinds";
export const previousAmountKey = (industryId: number, departmentId: number, accountId: number, month: number): string =>
  `${industryId}:${departmentId}:${accountId}:${month}`;
/** Preserve monetary strings and the first-match semantics of the former lookup. */
export function indexPreviousAmounts(amounts: readonly PreviousAmount[], previousKind: PreviousKind = 1): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const amount of amounts) {
    if (amount.previousKind !== previousKind) continue;
    const key = previousAmountKey(amount.industryId, amount.departmentId, amount.accountId, amount.month);
    if (!index.has(key)) index.set(key, amount.amount);
  }
  return index;
}

export function createPreviousInput(contents: PlanContents, industryId: number, departmentId: number, previousKind: PreviousKind = 1): PreviousInput {
  const amounts = indexPreviousAmounts(contents.previousAmounts, previousKind);
  return { previousKind, industryId, departmentId, rows: contents.accounts.map(account => ({ accountId: account.id,
    amounts: Object.fromEntries(initiativeMonths.map(month => [month, amounts.get(previousAmountKey(industryId, departmentId, account.id, month)) ?? "0"])) })) };
}
