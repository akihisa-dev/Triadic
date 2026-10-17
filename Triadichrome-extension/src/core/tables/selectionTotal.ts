import { amountToYen, checkedYen } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import { resolvedAmount, type KindId, type PreviousInput } from "../domain/kinds";
import type { InitiativeEntryDraft } from "../domain/plan";
import { gridBounds, type GridCell, type GridSelection } from "./grid";

export type SelectionTotal = { amount: number; error?: never } | { error: string; amount?: never } | null;

/** Read only the selected cells; validate the final sum after exact cancellation. */
function selectionTotal(selection: GridSelection | null, valueAt: (cell: GridCell) => string | null): SelectionTotal {
  if (!selection) return null;
  const bounds = gridBounds(selection);
  let total = 0n, count = 0;
  try {
    for (let row = bounds.top; row <= bounds.bottom; row++) {
      for (let column = bounds.left; column <= bounds.right; column++) {
        const value = valueAt({ row, column });
        if (value === null) continue;
        total += BigInt(amountToYen(value.trim() || "0"));
        count++;
      }
    }
  } catch {
    return { error: "選択範囲に不正な金額があります。" };
  }
  if (!count) return null;
  try { return { amount: checkedYen(total) }; }
  catch { return { error: "選択範囲の合計が計算できる上限を超えています。" }; }
}

export function initiativeSelectionTotal(draft: InitiativeEntryDraft, kind: KindId, selection: GridSelection | null): SelectionTotal {
  return selectionTotal(selection, cell => {
    const row = draft.rows[cell.row], month = initiativeMonths[cell.column];
    if (!row || month === undefined || row.accountId === null) throw new Error("選択範囲が無効です。");
    const sourceKind = kind === 2 && row.overrides?.[2]?.[month] === undefined ? 1 : kind;
    if (row.invalidAmounts?.[sourceKind]?.[month]) throw new Error("入力中の金額です。");
    return resolvedAmount(row, kind, month);
  });
}

/** Group and ratio rows are excluded to avoid counting the same amount twice. */
export function previousSelectionTotal(draft: PreviousInput | undefined, rowIds: (number | null)[], selection: GridSelection | null): SelectionTotal {
  if (!draft || !selection) return null;
  const inputs = new Map(draft.rows.map(row => [row.accountId, row.amounts]));
  return selectionTotal(selection, cell => {
    const id = rowIds[cell.row], month = initiativeMonths[cell.column];
    if (id === undefined || month === undefined) throw new Error("選択範囲が無効です。");
    return id === null ? null : inputs.get(id)?.[month] ?? "0";
  });
}
