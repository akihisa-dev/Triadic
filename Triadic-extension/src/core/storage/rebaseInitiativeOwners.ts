import { initiativeReferences } from "./rebaseReferences";
import type { Database } from "./sqliteRuntime";

/** Stored creation identity and contents keep row edits on the same initiative after a restore. */
export function canMergeInitiativeOwners(base: Database, local: Database, external: Database): boolean {
  const databases = [base, local, external];
  const columns = base.exec("PRAGMA table_info(initiatives)")[0]!.values.map(row => String(row[1]));
  // identity is retained even when the baseline has no account rows; revision/order are mutable.
  const owners = databases.map(db => new Map((db.exec("SELECT * FROM initiatives")[0]?.values ?? []).map(row =>
    [row[0], JSON.stringify(row.filter((_, index) => !["revision", "sort_order"].includes(columns[index]!)))])));
  // Matching headers do not identify two independently registered initiatives.
  for (const id of owners[1]!.keys()) {
    if (!owners[0]!.has(id) && owners[2]!.has(id)) return false;
  }
  const originalRows = base.exec("SELECT id, initiative_id FROM initiative_rows")[0]?.values ?? [];
  const retainedRows = databases.map(db => new Map((db.exec("SELECT id, initiative_id FROM initiative_rows")[0]?.values ?? []).map(row => [row[0], row[1]])));
  const missingOwners = retainedRows.map(rows => new Set(originalRows.filter(([rowId, owner]) => rows.get(rowId) !== owner).map(([, owner]) => owner)));
  for (const { initiativeId: id, source, other, after } of initiativeReferences(databases)) {
    const opposite = owners[other]!.get(id);
    if (opposite !== undefined && opposite !== owners[source]!.get(id)) return false;
    if (opposite === undefined && owners[0]!.has(id)) return false;
    // Losing an original row while editing/adding another may indicate a replacement.
    if (after && missingOwners[other]!.has(id)) return false;
  }
  return true;
}
