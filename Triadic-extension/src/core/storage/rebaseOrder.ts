import type { SqlValue } from "./sqliteRuntime";
import type { rebaseLayout } from "./rebaseLayout";
type Rows = ReadonlyMap<string, SqlValue[]>;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Keep the committed sequence; append this edit's incoming rows in their own order.
 * A single reorder of surviving base rows can be combined with independent additions.
 * Ambiguous reorders, pre-existing ties and exhausted positions stay unsaved.
 */
export function mergeRebaseOrder(table: string, original: Rows, local: Rows, external: Rows, combined: Map<string, SqlValue[]>, layout: ReturnType<typeof rebaseLayout>): boolean {
  const initiative = table === "initiative_rows";
  const master = table === "master_order";
  const parent = master ? 0 : layout.index(initiative ? "initiative_id" : "parent_id");
  const position = layout.index(initiative ? "sort_order" : "position");
  const ownerOf = (row: SqlValue[]) => master ? 0 : row[parent]!;
  const indexOwners = (rows: Rows) => {
    const grouped = new Map<SqlValue, [string, SqlValue[]][]>();
    for (const entry of rows) {
      const owner = ownerOf(entry[1]);
      const entries = grouped.get(owner) ?? [];
      entries.push(entry); grouped.set(owner, entries);
    }
    return new Map([...grouped].map(([owner, entries]) => [owner, entries
      .sort((a, b) => Number(a[1][position]) - Number(b[1][position]) || a[0].localeCompare(b[0])).map(([key]) => key)]));
  };
  const base = indexOwners(original), edited = indexOwners(local), latest = indexOwners(external);
  const parents = new Set([...base.keys(), ...edited.keys()]);
  for (const owner of parents) {
    const baseOrder = base.get(owner) ?? [], localOrder = edited.get(owner) ?? [], latestOrder = latest.get(owner) ?? [];
    if (equal(baseOrder, localOrder) && baseOrder.every(key => original.get(key)![position] === local.get(key)![position])) continue;
    for (const [rows, order] of [[original, baseOrder], [local, localOrder], [external, latestOrder]] as const) {
      if (new Set(order.map(key => rows.get(key)![position])).size !== order.length) return false;
    }
    const survives = (key: string) => combined.has(key) && ownerOf(combined.get(key)!) === owner;
    const localKeys = new Set(localOrder), latestKeys = new Set(latestOrder);
    const shared = new Set(baseOrder.filter(key => survives(key) && localKeys.has(key) && latestKeys.has(key)));
    const baseShared = baseOrder.filter(key => shared.has(key)), localShared = localOrder.filter(key => shared.has(key)), latestShared = latestOrder.filter(key => shared.has(key));
    const localReordered = !equal(baseShared, localShared), latestReordered = !equal(baseShared, latestShared);
    if (localReordered && latestReordered && !equal(localShared, latestShared)) return false;
    let order = latestOrder.filter(survives);
    if (localReordered) {
      let index = 0;
      order = order.map(key => shared.has(key) ? localShared[index++]! : key);
    }
    const committed = new Set(order);
    const incoming = localOrder.filter(key => survives(key) && !committed.has(key));
    order.push(...incoming);
    if (initiative || master) {
      order.forEach((key, index) => { combined.get(key)![position] = index; });
    } else {
      // Retain legal gaps and the committed slots, including a reorder's positions.
      const slots = latestOrder.filter(survives).map(key => Number(external.get(key)![position]));
      order.slice(0, slots.length).forEach((key, index) => { combined.get(key)![position] = slots[index]!; });
      let maximum = latestOrder.reduce((max, key) => Math.max(max, Number(external.get(key)![position])), -1);
      for (const key of incoming) {
        const next = Math.max(maximum + 1, Number(local.get(key)![position]));
        if (!Number.isSafeInteger(next)) return false;
        combined.get(key)![position] = maximum = next;
      }
    }
  }
  return true;
}
