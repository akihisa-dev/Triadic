import { amountToYen } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import { hasInvalidAmountInput, type MonthAmounts } from "../domain/kinds";
import type { InitiativeEntryDraft } from "../domain/plan";

/** Move the primary amounts and sparse confirmed overrides together, without dropping data. */
export function shiftInitiativeMonths(draft: InitiativeEntryDraft, offset: number): InitiativeEntryDraft {
  if (!Number.isInteger(offset) || offset === 0 || Math.abs(offset) > 11) throw new Error("移動月数は1〜11か月で指定してください。");
  if (draft.invalidNumbers || draft.rows.some(hasInvalidAmountInput)) throw new Error("入力中の不正な金額を修正してから移動してください。");
  const rows = draft.rows.map((row, rowIndex) => {
    const amounts: MonthAmounts = {}, manual: MonthAmounts = {};
    for (const [index, month] of initiativeMonths.entries()) {
      const primary = row.amounts[month] ?? "0", override = row.overrides?.[2]?.[month];
      const yen = amountToYen(primary || "0");
      if (override !== undefined) amountToYen(override || "0");
      const target = initiativeMonths[index + offset];
      if (target === undefined) {
        if (yen !== 0 || override !== undefined) throw new Error(`${rowIndex + 1}行目の${month}月に金額または確定予算の手修正があり、年度外へ出るため移動できません。`);
        continue;
      }
      amounts[target] = primary;
      if (override !== undefined) manual[target] = override;
    }
    for (const month of initiativeMonths) amounts[month] ??= "0";
    return { ...row, amounts, overrides: { ...row.overrides, 2: manual } };
  });
  return { ...draft, rows };
}
