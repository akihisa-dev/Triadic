import { canMergeInitiativeOwners } from "./rebaseInitiativeOwners";
import { canMergeAccountReferences } from "./rebaseAccountReferences";
import { mergeRebaseOrder } from "./rebaseOrder";
import { canMergeRowAccounts } from "./rebaseRowAccounts";
import { canMergeDetailTargets } from "./rebaseDetailTargets";
import { canMergeClassifications } from "./rebaseClassifications";
import { remapAddedAccounts } from "./rebaseAccounts";
import { BUSINESS_TABLES } from "./triadicSchema";
import { exportTriadicDatabase, openTriadicDatabase } from "./triadicDatabase";
import { trackHistoryChange, createBusinessSnapshot } from "./dataHistory";
import type { Database, SqlValue } from "./sqliteRuntime";
import { rebaseLayout } from "./rebaseLayout";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function readRebaseRows(database: Database, table: string): Map<string, SqlValue[]> {
  const { keys, membership, referenceKeys } = rebaseLayout(database, table);
  const [account, group] = referenceKeys;
  if (!membership && !keys.length) throw new Error("統合対象の行識別子がありません。");
  const result = new Map<string, SqlValue[]>();
  for (const row of database.exec(`SELECT * FROM ${table}`)[0]?.values ?? []) {
    let values: SqlValue[];
    if (membership) {
      if ((row[account!] === null) === (row[group!] === null)) throw new Error("所属対象の識別子が不正です。");
      values = row[account!] === null ? ["group",row[group!]!] : ["account",row[account!]!];
    } else values = keys.map(index => row[index]!);
    if (values.some(value => typeof value !== "string" && (typeof value !== "number" || !Number.isSafeInteger(value)))) throw new Error("統合対象の行識別子が不正です。");
    const key = JSON.stringify(values);
    if (result.has(key)) throw new Error("統合対象の行識別子が重複しています。");
    result.set(key,row);
  }
  return result;
}
/** Merge only independent rows. Any ambiguous edit or invalid combined document stays unsaved. */
export async function rebasePlan(baseBytes: Uint8Array, editedBytes: Uint8Array, currentBytes: Uint8Array) {
  const databases: Database[] = [];
  try {
    for (const bytes of [baseBytes, editedBytes, currentBytes]) databases.push(await openTriadicDatabase(bytes));
    const [base, edited, current] = databases as [Database, Database, Database];
    const identity = (db: Database) => db.exec("SELECT fiscal_year, created_at FROM document_info")[0]?.values;
    if (!equal(identity(base), identity(current))) return null;
    if (!remapAddedAccounts(base, edited, current)) return null;
    if (!canMergeInitiativeOwners(base, edited, current)) return null;
    if (!canMergeAccountReferences(base, edited, current)) return null;
    if (!canMergeRowAccounts(base, edited, current)) return null;
    if (!canMergeDetailTargets(base, edited, current)) return null;
    if (!canMergeClassifications(base, edited, current)) return null;
    base.attachReadonly("comparison_edit", edited.export());
    const replacements = new Map<string, { removed: SqlValue[][]; inserted: SqlValue[][] }>();
    for (const table of BUSINESS_TABLES) {
      if (table === "document_info") continue;
      // Ask SQLite whether this table changed before constructing three JS indexes.
      const difference = base.exec(`SELECT EXISTS(SELECT * FROM main.${table} EXCEPT SELECT * FROM comparison_edit.${table}) OR EXISTS(SELECT * FROM comparison_edit.${table} EXCEPT SELECT * FROM main.${table})`)[0]?.values[0]?.[0];
      if (!difference) continue;
      const original = readRebaseRows(base, table), local = readRebaseRows(edited, table), latest = readRebaseRows(current, table);
      const externalRows = new Map([...latest].map(([key, row]) => [key, [...row]]));
      const layout = rebaseLayout(base, table);
      const { comparable } = layout;
      // Previous cells are identified by their business coordinates, not a copy's auto-increment ID.
      const sameRow = (a: SqlValue[] | undefined, b: SqlValue[] | undefined) =>
        equal(comparable(a), comparable(b));
      let nextId = table === "previous_amounts" ? Math.max(0, ...databases.map(db =>
        Number(db.exec("SELECT seq FROM sqlite_sequence WHERE name = 'previous_amounts'")[0]?.values[0]?.[0] ?? 0))) : 0;
      let changed = false;
      for (const key of new Set([...original.keys(), ...local.keys()])) {
        const before = original.get(key), after = local.get(key), external = latest.get(key);
        if (sameRow(before, after)) continue;
        if (!sameRow(before, external) && !sameRow(after, external)) return null;
        if (sameRow(after, external)) continue;
        if (after) {
          const row = [...after];
          if (table === "previous_amounts") {
            if (external) row[0] = external[0]!;
            else {
              if (!Number.isSafeInteger(++nextId)) return null;
              row[0] = nextId;
            }
          }
          latest.set(key, row);
        } else latest.delete(key);
        changed = true;
      }
      if (table === "initiative_rows" || table === "aggregation_members" || table === "master_order") {
        if (!mergeRebaseOrder(table, original, local, externalRows, latest, layout)) return null;
        changed ||= !equal([...externalRows], [...latest]);
      }
      if (changed) replacements.set(table, {
        removed: [...externalRows].filter(([key, row]) => !equal(row, latest.get(key))).map(([, row]) => row),
        inserted: [...latest].filter(([key, row]) => !equal(row, externalRows.get(key))).map(([, row]) => row),
      });
    }
    if (!replacements.size) return { bytes: currentBytes, operation: null };
    // Work on a private copy; remove changed rows first so reordered unique positions can swap safely.
    current.exec("PRAGMA foreign_keys = OFF; BEGIN");
    for (const [table, { removed }] of replacements) {
      const { keys, membership, referenceKeys, columns } = rebaseLayout(current, table);
      for (const row of removed) {
        const indexes = membership ? referenceKeys.filter(index => row[index] !== null) : keys;
        current.run(`DELETE FROM ${table} WHERE ${indexes.map(index => `${columns[index]} IS ?`).join(" AND ")}`, indexes.map(index => row[index]!));
      }
    }
    for (const [table, { inserted }] of replacements) for (const row of inserted) {
      current.run(`INSERT INTO ${table} VALUES (${row.map(() => "?").join(",")})`, row);
    }
    current.run("UPDATE document_info SET updated_at = ?", [new Date().toISOString()]);
    current.exec("COMMIT; PRAGMA foreign_keys = ON");
    const bytes = await trackHistoryChange(currentBytes, exportTriadicDatabase(current));
    return { bytes, operation: { before: await createBusinessSnapshot(currentBytes), after: await createBusinessSnapshot(bytes) } };
  } catch {
    // Different document, malformed external data, duplicate IDs, or broken references require a separate save.
    return null;
  } finally { for (const database of databases) database.close(); }
}
