import type { Account } from "./accountMaster";
import { amountToYen, yenToAmount } from "./amounts";
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

export function budgetAmountHint(row: InitiativeRow, kind: KindId, month: number): string | undefined {
  if (kind !== 2 || row.overrides?.[2]?.[month] === undefined || row.invalidAmounts?.[1]?.[month] || row.invalidAmounts?.[2]?.[month]) return undefined;
  try {
    const primary = amountToYen(resolvedAmount(row, 1, month));
    const final = amountToYen(resolvedAmount(row, 2, month));
    if (primary === final) return `一次 ${yenToAmount(primary)}・同額で手修正`;
    // Two valid inputs may have a difference beyond Number's safe integer range.
    const difference = BigInt(final) - BigInt(primary);
    const absolute = difference < 0n ? -difference : difference;
    const fraction = String(absolute % 1000n).padStart(3, "0").replace(/0+$/, "");
    const delta = `${difference < 0n ? "−" : "+"}${absolute / 1000n}${fraction ? `.${fraction}` : ""}`;
    return `一次 ${yenToAmount(primary)} → 確定 ${yenToAmount(final)}（${delta}）`;
  } catch { return undefined; }
}
