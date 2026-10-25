import type { Database, SqlValue } from "./sqliteRuntime";

/** Changed references retain their source side, including deletions from the baseline. */
export function* changedReferences(databases: readonly Database[], query: string) {
  const copies = databases.map(db => new Map((db.exec(query)[0]?.values ?? []).map(row => [row[0], row])));
  for (const side of [1, 2]) for (const key of new Set([...copies[0]!.keys(), ...copies[side]!.keys()])) {
    const before = copies[0]!.get(key), after = copies[side]!.get(key), other = 3 - side;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!after && !copies[other]!.has(key)) continue;
    yield { row: (after ?? before) as SqlValue[], source: after ? side : 0, other, after };
  }
}

/** One dependency path from changed account rows/months to both their owner and account. */
export function* initiativeReferences(databases: readonly Database[]) {
  for (const query of [
    "SELECT id, initiative_id, account_id, sort_order FROM initiative_rows",
    "SELECT a.row_id || ':' || a.kind_id || ':' || a.month, r.initiative_id, r.account_id, a.amount_yen FROM initiative_amounts a JOIN initiative_rows r ON r.id=a.row_id",
  ]) for (const change of changedReferences(databases, query)) {
    yield { ...change, initiativeId: change.row[1]!, accountId: change.row[2]! };
  }
}

export type InitiativeReference = ReturnType<typeof initiativeReferences> extends Generator<infer Change> ? Change : never;
