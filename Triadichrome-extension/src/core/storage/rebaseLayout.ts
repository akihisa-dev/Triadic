import type { Database, SqlValue } from "./sqliteRuntime";

const layouts = new WeakMap<Database, Map<string, ReturnType<typeof describeLayout>>>();
const businessKeys: Record<string, readonly string[]> = {
  previous_amounts: ["account_id", "industry_id", "department_id", "month"],
};
const ignored: Record<string, readonly string[]> = {
  previous_amounts: ["id", "revision"], initiative_rows: ["sort_order", "revision"],
  aggregation_members: ["position"], master_order: ["position"], initiatives: ["revision"],
};

function describeLayout(database: Database, table: string) {
  const definitions = database.exec(`PRAGMA table_info(${table})`)[0]?.values ?? [];
  const columns = definitions.map(column => String(column[1]));
  const index = (name: string) => {
    const value = columns.indexOf(name);
    if (value < 0) throw new Error(`統合対象の識別項目がありません: ${table}.${name}`);
    return value;
  };
  const keys = businessKeys[table]?.map(index) ?? definitions
    .map((column, position) => ({ position, order: Number(column[5]) }))
    .filter(key => key.order).sort((a, b) => a.order - b.order).map(key => key.position);
  const membership = table === "aggregation_members" || table === "master_order";
  const referenceKeys = membership ? ["account_id", table === "master_order" ? "aggregation_group_id" : "group_id"].map(index) : keys;
  const comparable = (row: SqlValue[] | undefined) => row?.filter((_, position) => !ignored[table]?.includes(columns[position]!));
  return { columns, index, keys, membership, referenceKeys, comparable };
}

/** Column positions come from the validated schema, never a second copy of the DDL. */
export function rebaseLayout(database: Database, table: string) {
  let cache = layouts.get(database);
  if (!cache) { cache = new Map(); layouts.set(database, cache); }
  let layout = cache.get(table);
  if (!layout) { layout = describeLayout(database, table); cache.set(table, layout); }
  return layout;
}
