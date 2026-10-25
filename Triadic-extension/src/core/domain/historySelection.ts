import type { DataHistoryEntry } from "./dataHistory";

/** Index once per selection/list change; row checks share the resulting set. */
export function historySelection(entries: readonly Pick<DataHistoryEntry, "id">[], selected: readonly number[]) {
  const available = new Set(entries.map(entry => entry.id));
  const ids = selected.filter(id => available.has(id));
  return { ids, selectedIds: new Set(ids) };
}
