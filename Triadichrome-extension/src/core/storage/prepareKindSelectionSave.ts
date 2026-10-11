import type { KindScreen, KindId } from "../domain/kinds";
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
