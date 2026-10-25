import type { Account } from "./accountMaster";
import { amountToYen } from "./amounts";
import { initiativeMonths } from "./calendar";
import { resolvedAmount, type KindId } from "./kinds";
import type { InitiativeRow } from "./plan";

/** Informational only: no thresholds, mutations, or persistence. */
export function hasUnclassifiedAmount(row: InitiativeRow, kind: KindId, account: Account | undefined): boolean {
  if (!account || account.accountType !== null) return false;
  return initiativeMonths.some(month => {
    if (row.invalidAmounts?.[kind]?.[month] || (kind === 2 && row.overrides?.[2]?.[month] === undefined && row.invalidAmounts?.[1]?.[month])) return false;
    try { return amountToYen(resolvedAmount(row, kind, month)) !== 0; } catch { return false; }
  });
}
