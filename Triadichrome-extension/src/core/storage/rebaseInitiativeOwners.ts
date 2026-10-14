import type { Database } from "./sqliteRuntime";

/** New rows and edited amounts must still belong to the same initiative after a restore. */
export function canMergeInitiativeOwners(base: Database, local: Database, external: Database): boolean {
  const databases = [base, local, external];
  const columns = base.exec("PRAGMA table_info(initiatives)")[0]!.values.map(row => String(row[1]));
  const owners = databases.map(db => new Map((db.exec("SELECT * FROM initiatives")[0]?.values ?? []).map(row =>
    [row[0], JSON.stringify(row.filter((_, index) => !["revision", "sort_order"].includes(columns[index]!)))])));
  // Matching headers do not identify two independently registered initiatives.
  for (const id of owners[1]!.keys()) {
    if (!owners[0]!.has(id) && owners[2]!.has(id)) return false;
  }
  const originalRows = base.exec("SELECT id, initiative_id FROM initiative_rows")[0]?.values ?? [];
  const retainedRows = databases.map(db => new Map((db.exec("SELECT id, initiative_id FROM initiative_rows")[0]?.values ?? []).map(row => [row[0], row[1]])));
  const missingOwners = retainedRows.map(rows => new Set(originalRows.filter(([rowId, owner]) => rows.get(rowId) !== owner).map(([, owner]) => owner)));
  for (const query of [
    "SELECT id, initiative_id, account_id, sort_order FROM initiative_rows",
    "SELECT a.row_id || ':' || a.kind_id || ':' || a.month, r.initiative_id, a.amount_yen FROM initiative_amounts a JOIN initiative_rows r ON r.id=a.row_id",
  ]) {
    const copies = databases.map(db => new Map((db.exec(query)[0]?.values ?? []).map(row => [row[0], row])));
    for (const side of [1, 2]) for (const key of new Set([...copies[0]!.keys(), ...copies[side]!.keys()])) {
      const before = copies[0]!.get(key), after = copies[side]!.get(key), other = 3 - side;
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      if (!after && !copies[other]!.has(key)) continue;
      const row = after ?? before!, source = after ? side : 0, id = row[1]!;
      const opposite = owners[other]!.get(id);
      if (opposite !== undefined && opposite !== owners[source]!.get(id)) return false;
      if (opposite === undefined && owners[0]!.has(id)) return false;
      // A replacement can have exactly the same header. Existing row IDs provide
      // additional evidence; losing one while adding/editing another is ambiguous.
      if (after && missingOwners[other]!.has(id)) return false;
    }
  }
  return true;
}
