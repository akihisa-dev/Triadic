import { changedReferences, initiativeReferences } from "./rebaseReferences";
import type { Database } from "./sqliteRuntime";

/** A reused account number must not redirect a concurrent reference or amount edit. */
export function canMergeAccountReferences(base: Database, local: Database, external: Database): boolean {
  const databases = [base, local, external];
  const accounts = databases.map(db => new Map((db.exec("SELECT * FROM accounts")[0]?.values ?? []).map(row => [row[0], JSON.stringify(row)])));
  const queries = [
    "SELECT account_id || ':' || industry_id || ':' || department_id || ':' || month, account_id, amount_yen FROM previous_amounts",
    "SELECT account_id, account_id, parent_id, sign, position FROM aggregation_members WHERE account_id IS NOT NULL",
  ];
  const references = [...initiativeReferences(databases), ...queries.flatMap(query =>
    [...changedReferences(databases, query)].map(change => ({ ...change, accountId: change.row[1]! })))];
  for (const { accountId: id, source, other } of references) {
    const opposite = accounts[other]!.get(id);
    if (opposite !== undefined && opposite !== accounts[source]!.get(id)) return false;
    if (opposite === undefined && accounts[0]!.has(id)) return false;
  }
  return true;
}
