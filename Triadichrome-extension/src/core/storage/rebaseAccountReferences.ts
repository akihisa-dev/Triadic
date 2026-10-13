import type { Database, SqlValue } from "./sqliteRuntime";

/** A reused account number must not redirect a concurrent reference or amount edit. */
export function canMergeAccountReferences(base: Database, local: Database, external: Database): boolean {
  const databases = [base, local, external];
  const accounts = databases.map(db => new Map((db.exec("SELECT * FROM accounts")[0]?.values ?? []).map(row => [row[0], JSON.stringify(row)])));
  const queries = [
    "SELECT id, account_id, initiative_id, sort_order FROM initiative_rows",
    "SELECT a.row_id || ':' || a.kind_id || ':' || a.month, r.account_id, a.amount_yen FROM initiative_amounts a JOIN initiative_rows r ON r.id=a.row_id",
    "SELECT account_id || ':' || industry_id || ':' || department_id || ':' || month, account_id, amount_yen FROM previous_amounts",
    "SELECT account_id, account_id, parent_id, sign, position FROM aggregation_members WHERE account_id IS NOT NULL",
  ];
  for (const query of queries) {
    const copies = databases.map(db => new Map((db.exec(query)[0]?.values ?? []).map(row => [row[0], row])));
    for (const side of [1, 2]) for (const key of new Set([...copies[0]!.keys(), ...copies[side]!.keys()])) {
      const before = copies[0]!.get(key), after = copies[side]!.get(key), other = 3 - side;
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      if (!after && !copies[other]!.has(key)) continue;
      const row: SqlValue[] = after ?? before!, source = after ? side : 0, id = row[1]!;
      const opposite = accounts[other]!.get(id);
      if (opposite !== undefined && opposite !== accounts[source]!.get(id)) return false;
      if (opposite === undefined && accounts[0]!.has(id)) return false;
    }
  }
  return true;
}
