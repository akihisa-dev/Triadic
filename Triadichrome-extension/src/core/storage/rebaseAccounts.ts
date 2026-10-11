import type { Database } from "./sqliteRuntime";

/** Remap only independently created accounts in the private local copy, including every reference. */
export function remapAddedAccounts(base: Database, local: Database, external: Database): boolean {
  const ids = (db: Database) => new Set((db.exec("SELECT id FROM accounts")[0]?.values ?? []).map(([id]) => Number(id)));
  const original = ids(base), ours = ids(local), theirs = ids(external);
  let maximum = Math.max(0, ...[base, local, external].map(db => Number(db.exec("SELECT seq FROM sqlite_sequence WHERE name = 'accounts'")[0]?.values[0]?.[0] ?? 0)), ...original, ...ours, ...theirs);
  const replacements = new Map<number, number>();
  for (const id of ours) if (!original.has(id) && theirs.has(id)) {
    if (!Number.isSafeInteger(++maximum)) return false;
    replacements.set(id, maximum);
  }
  if (!replacements.size) return true;
  local.exec("PRAGMA foreign_keys = OFF; BEGIN");
  try {
    for (const [before, after] of replacements) {
      local.run("UPDATE accounts SET id = ? WHERE id = ?", [after, before]);
      for (const table of ["master_order", "aggregation_members", "initiative_rows", "previous_amounts"]) local.run(`UPDATE ${table} SET account_id = ? WHERE account_id = ?`, [after, before]);
    }
    local.run("UPDATE sqlite_sequence SET seq = ? WHERE name = 'accounts'", [maximum]);
    local.exec("COMMIT");
    return true;
  } catch { local.exec("ROLLBACK"); return false; }
  finally { local.exec("PRAGMA foreign_keys = ON"); }
}
