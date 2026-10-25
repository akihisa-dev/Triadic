import { changedReferences, type InitiativeReference } from "./rebaseReferences";
import type { Database } from "./sqliteRuntime";

/** A reused account number must not redirect a concurrent reference or amount edit. */
export function accountReferenceChecks(base: Database, local: Database, external: Database) {
  const databases = [base, local, external];
  const accounts = databases.map(db => new Map((db.exec("SELECT * FROM accounts")[0]?.values ?? []).map(row => [row[0], JSON.stringify(row)])));
  const queries = [
    "SELECT previous_kind || ':' || account_id || ':' || industry_id || ':' || department_id || ':' || month, account_id, amount_yen FROM previous_amounts",
    "SELECT account_id, account_id, parent_id, sign, position FROM aggregation_members WHERE account_id IS NOT NULL",
  ];
  const accepts = ({ accountId: id, source, other }: Pick<InitiativeReference, "accountId" | "source" | "other">): boolean => {
    const opposite = accounts[other]!.get(id);
    if (opposite !== undefined && opposite !== accounts[source]!.get(id)) return false;
    if (opposite === undefined && accounts[0]!.has(id)) return false;
    return true;
  };
  return { initiative: accepts, remaining: () => {
    for (const query of queries) for (const change of changedReferences(databases, query)) {
      if (!accepts({ ...change, accountId: change.row[1]! })) return false;
    }
    return true;
  } };
}
