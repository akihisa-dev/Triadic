import { amountToYen, yenToAmount } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import { hasInvalidAmountInput, type KindId, type MonthAmounts } from "../domain/kinds";
import type { InitiativeEntryDraft } from "../domain/plan";
import { pasteInitiativeGrid } from "./initiativeGrid";

/** Largest remainder in integer yen; ties follow April–March, including negative allocations. */
export function allocateAnnualAmount(total: string, weights: MonthAmounts): MonthAmounts {
  const yen = BigInt(amountToYen(total)), absolute = yen < 0n ? -yen : yen;
  const entries = Object.entries(weights);
  if (!entries.length) throw new Error("対象月を一つ以上選択してください。");
  if (entries.some(([month]) => !initiativeMonths.some(value => String(value) === month))) throw new Error("対象月が正しくありません。");
  const values = initiativeMonths.map(month => {
    const text = weights[month];
    if (text === undefined) return 0n;
    try { const value = BigInt(amountToYen(text)); if (value < 0n) throw new Error(); return value; }
    catch { throw new Error("比率は0以上・小数点以下3桁までの有効な数値を入力してください。"); }
  });
  const sum = values.reduce((left, right) => left + right, 0n);
  if (sum === 0n) throw new Error("比率が0より大きい月を一つ以上指定してください。");
  const portions = values.map(weight => absolute * weight / sum);
  const order = values.map((weight, index) => ({ index, remainder: absolute * weight % sum }))
    .sort((left, right) => left.remainder > right.remainder ? -1 : left.remainder < right.remainder ? 1 : left.index - right.index);
  const remainder = Number(absolute - portions.reduce((left, right) => left + right, 0n));
  for (let index = 0; index < remainder; index++) portions[order[index]!.index]! += 1n;
  return Object.fromEntries(initiativeMonths.map((month, index) => [month, yenToAmount(Number(yen < 0n ? -portions[index]! : portions[index]!))]));
}

/** Apply all twelve months as one grid edit; untouched rows and other kinds stay independent. */
export function applyAnnualAllocation(draft: InitiativeEntryDraft, kind: KindId, row: number, total: string, weights: MonthAmounts): InitiativeEntryDraft {
  if (draft.invalidNumbers || draft.rows.some(hasInvalidAmountInput)) throw new Error("入力中の不正な金額を修正してから配分してください。");
  const amounts = allocateAnnualAmount(total, weights);
  return pasteInitiativeGrid(draft, kind, { row, column: 0 }, initiativeMonths.map(month => amounts[month]).join("\t"));
}
