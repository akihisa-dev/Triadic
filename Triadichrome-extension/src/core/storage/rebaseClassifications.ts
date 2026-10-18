import { initiativeReferences } from "./rebaseReferences";
import type { Database, SqlValue } from "./sqliteRuntime";
import { rebaseLayout } from "./rebaseLayout";

/** Numeric references may be reused after deletion or restoration; compare the durable master identity too. */
export function canMergeClassifications(base: Database, local: Database, external: Database): boolean {
  const databases = [base, local, external];
  const references: Record<string, string> = { department_id: "departments", industry_id: "industries", expansion_id: "expansions", period_type_id: "period_types", category_id: "expansion_categories", expansion_category_id: "expansion_categories", parent_id: "aggregation_groups", group_id: "aggregation_groups", aggregation_group_id: "aggregation_groups" };
  const identities = new Map([...new Set(Object.values(references))].map(table => [table, databases.map(db => new Map((db.exec(`SELECT * FROM ${table}`)[0]?.values ?? []).map(row => [row[0], table === "departments" || table === "industries" ? String(row[1]) : JSON.stringify(row)])))]));
  const owners = databases.map(db => new Map((db.exec("SELECT id, department_id, industry_id, expansion_id, period_type_id, expansion_category_id FROM initiatives")[0]?.values ?? []).map(row => [row[0], row])));
  const ownerMasters = ["departments", "industries", "expansions", "period_types", "expansion_categories"];
  for (const { initiativeId, source, other } of initiativeReferences(databases)) {
    const owner = owners[source]!.get(initiativeId)!;
    for (const [index, master] of ownerMasters.entries()) {
      const id = owner[index + 1];
      if (id === null || id === undefined) continue;
      const copies = identities.get(master)!, opposite = copies[other]!.get(id);
      if (opposite !== undefined && opposite !== copies[source]!.get(id)) return false;
      if (opposite === undefined && copies[0]!.has(id)) return false;
    }
  }
  for (const table of ["initiatives", "previous_amounts", "department_industries", "expansion_category_assignments", "aggregation_members", "master_order"]) {
    const { columns, referenceKeys } = rebaseLayout(base, table);
    const read = (db: Database) => new Map((db.exec(`SELECT * FROM ${table}`)[0]?.values ?? []).map(row => [JSON.stringify(referenceKeys.map(index => row[index])), row]));
    const rows = databases.map(read);
    const comparable = (row: SqlValue[] | undefined) => row?.filter((_, index) => columns[index] !== "revision" && !(table === "previous_amounts" && columns[index] === "id"));
    for (const side of [1, 2]) for (const key of new Set([...rows[0]!.keys(), ...rows[side]!.keys()])) {
      const before = rows[0]!.get(key), after = rows[side]!.get(key), other = 3 - side;
      if (JSON.stringify(comparable(before)) === JSON.stringify(comparable(after))) continue;
      if (!after && !rows[other]!.has(key)) continue;
      const source = after ? side : 0, row = after ?? before!;
      for (const [column, master] of Object.entries(references)) {
        const index = columns.indexOf(column);
        if (index < 0 || row[index] === null) continue;
        const id = row[index]!, copies = identities.get(master)!;
        const opposite = copies[other]!.get(id);
        if (opposite !== undefined && opposite !== copies[source]!.get(id)) return false;
        if (opposite === undefined && copies[0]!.has(id)) return false;
      }
    }
  }
  return true;
}
