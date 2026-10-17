import { isValidAmount } from "./amounts";
import { initiativeMonths } from "./calendar";
import { type KindId, type PreviousInput } from "./kinds";
import type { InitiativeEntryDraft } from "./plan";

export type InitiativeErrorLocation = { rowId: string | undefined; rowIndex: number; kind: KindId; month: number };

/** Locate stored inputs, not resolved amounts: an inherited error belongs to its primary cell. */
export function initiativeInputError(draft: Pick<InitiativeEntryDraft, "rows">): InitiativeErrorLocation | null {
  for (const [rowIndex, row] of draft.rows.entries()) for (const kind of [1, 2] as const) for (const month of initiativeMonths) {
    const text = kind === 1 ? row.amounts[month] : row.overrides?.[2]?.[month];
    if (row.invalidAmounts?.[kind]?.[month] || text !== undefined && text !== "" && !isValidAmount(text)) {
      return { rowId: row.id, rowIndex, kind, month };
    }
  }
  return null;
}

/** Use displayed account order, skipping subtotals and ratio rows. */
export function previousInputError(draft: PreviousInput | undefined, accountIds?: (number | null)[]): { accountId: number; month: number } | null {
  if (!draft) return null;
  const inputs = new Map(draft.rows.map(row => [row.accountId, row.amounts]));
  for (const id of accountIds ?? draft.rows.map(row => row.accountId)) {
    if (id === null) continue;
    for (const month of initiativeMonths) {
      const text = inputs.get(id)?.[month];
      if (text !== undefined && text !== "" && !isValidAmount(text)) return { accountId: id, month };
    }
  }
  return null;
}
