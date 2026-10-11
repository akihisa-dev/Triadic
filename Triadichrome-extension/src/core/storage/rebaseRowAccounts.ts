import type { Database, SqlValue } from "./sqliteRuntime";

/** A zero-row account change depends on all of that row's amounts staying unchanged. */
export function canMergeRowAccounts(base: Database, local: Database, external: Database): boolean {
  const read = (db: Database) => {
    const accounts = new Map((db.exec("SELECT id, account_id FROM initiative_rows")[0]?.values ?? []).map(([id, account]) => [String(id), account]));
    const amounts = new Map<string, SqlValue[][]>();
    for (const [row, ...value] of db.exec("SELECT row_id, kind_id, month, amount_yen FROM initiative_amounts ORDER BY row_id, kind_id, month")[0]?.values ?? []) {
      const values = amounts.get(String(row)) ?? [];
      values.push(value); amounts.set(String(row), values);
    }
    return { accounts, amounts };
  };
  const before = read(base), ours = read(local), theirs = read(external);
  for (const [id, account] of before.accounts) {
    if (ours.accounts.get(id) === theirs.accounts.get(id)
      && JSON.stringify(ours.amounts.get(id)) === JSON.stringify(theirs.amounts.get(id))) continue;
    const changedAmounts = (other: typeof before) => JSON.stringify(before.amounts.get(id)) !== JSON.stringify(other.amounts.get(id));
    if (ours.accounts.get(id) !== account && changedAmounts(theirs)
      || theirs.accounts.get(id) !== account && changedAmounts(ours)) return false;
  }
  return true;
}
