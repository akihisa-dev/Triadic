import { isKindId, type KindScreen, type KindId, type PreviousSelections } from "../domain/kinds";
import { applyKindSelection, validateKindSelection } from "./settings";
import { prepareSave } from "./prepareSave";

/** Selection changes cannot alter amounts, master data or derived start months.
 * Keep full file/snapshot validation while avoiding full plan reads and projections.
 */
export async function prepareKindSelectionSave(bytes: Uint8Array, screen: KindScreen, selected: KindId[], now = new Date().toISOString()) {
  const { contents: _contents, ...prepared } = await prepareSave(bytes, now, database => {
    validateKindSelection(screen, selected);
    const original = database.exec("SELECT first_kind, second_kind FROM kind_selections WHERE screen = ?", [screen])[0]?.values[0];
    if (original?.[0] === selected[0] && original?.[1] === (selected[1] ?? null)) return null;
    return () => {
      applyKindSelection(database, screen, selected);
      return original?.[0] !== selected[0] || original?.[1] !== (selected[1] ?? null);
    };
  }, () => undefined);
  return prepared;
}

/** Save the checked kinds and both baselines atomically. */
export async function prepareComparisonSelectionSave(bytes: Uint8Array, screen: keyof PreviousSelections, selected: KindId[], previous: import("../domain/kinds").BudgetPrevious, now = new Date().toISOString()) {
  const { contents: _contents, ...prepared } = await prepareSave(bytes, now, database => {
    if (!["cost-table", "expansion-table"].includes(screen) || !isKindId(previous[1]) || !isKindId(previous[2]) || (previous.display !== undefined && !isKindId(previous.display))) throw new Error("基準前年が正しくありません。");
    validateKindSelection(screen, selected);
    const original = database.exec("SELECT first_kind, second_kind, previous_kind, final_previous_kind, display_previous_kind FROM kind_selections WHERE screen = ?", [screen])[0]?.values[0];
    if (original?.[0] === selected[0] && original?.[1] === (selected[1] ?? null) && original?.[2] === previous[1] && original?.[3] === previous[2] && original?.[4] === (previous.display ?? original?.[4])) return null;
    return () => {
      applyKindSelection(database, screen, selected);
      database.run("UPDATE kind_selections SET previous_kind = ?, final_previous_kind = ?, display_previous_kind = COALESCE(?, display_previous_kind) WHERE screen = ?", [previous[1], previous[2], previous.display ?? null, screen]);
      return true;
    };
  }, () => undefined);
  return prepared;
}
