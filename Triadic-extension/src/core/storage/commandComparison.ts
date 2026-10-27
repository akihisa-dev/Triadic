import type { PlanCommand } from "../domain/planCommands";
import type { Database, SqlValue } from "./sqliteRuntime";

type Target = { table: string; where?: string; params?: SqlValue[] };
/** Enumerate stored side effects, including membership/order. Derived values and write counters are excluded. */
function targets(command: PlanCommand): Target[] {
  switch (command.type) {
    case "initiative.register": return [];
    case "initiative.update": return [
      { table: "initiatives", where: "id = ?", params: [command.id] },
      { table: "initiative_rows", where: "initiative_id = ?", params: [command.id] },
      { table: "initiative_amounts", where: "row_id IN (SELECT id FROM main.initiative_rows WHERE initiative_id = ?)", params: [command.id] },
    ];
    case "account": return [{ table: "accounts", ...("id" in command.change ? { where: "id = ?", params: [command.change.id] } : {}) }, { table: "master_order" }];
    case "expansion": return [{ table: "expansions" }, { table: "expansion_category_assignments" }];
    case "expansion-category": return [{ table: "expansion_categories" }];
    case "industry": return [{ table: "industries" }];
    case "department": return [{ table: "departments" }, { table: "department_industries" }];
    case "period": return [{ table: "period_types" }];
    case "settings": return (command.change.type === "selection" || command.change.type === "comparison") ? [{ table: "kind_selections" }]
      : command.change.type === "previous" ? [{ table: "previous_amounts", where: "industry_id = ? AND department_id = ? AND previous_kind = ?", params: [command.change.input.industryId!, command.change.input.departmentId!, command.change.input.previousKind] }]
        : [{ table: "previous_amounts" }];
    case "aggregation": throw new Error("集計の保存準備を使用してください。");
  }
}

/** Capture only affected stored rows inside SQLite; no plan projection or renderer JSON comparison. */
export function prepareCommandComparison(database: Database, command: PlanCommand) {
  const scopes = targets(command).map(({ table, where, params }, index) => {
    const columns = (database.exec(`PRAGMA main.table_info(${table})`)[0]?.values ?? [])
      .map(row => String(row[1])).filter(column => column !== "revision");
    const selection = `SELECT ${columns.join(",")} FROM main.${table}${where ? ` WHERE ${where}` : ""}`;
    const original = `command_before_${index}`;
    database.run(`CREATE TEMP TABLE ${original} AS ${selection}`, params);
    return { original, selection, params };
  });
  return {
    changed: () => command.type === "initiative.register" || scopes.some(({ original, selection, params }) =>
      database.exec(`SELECT 1 FROM (SELECT * FROM temp.${original} EXCEPT ${selection}) LIMIT 1`, params).length > 0
      || database.exec(`SELECT 1 FROM (${selection} EXCEPT SELECT * FROM temp.${original}) LIMIT 1`, params).length > 0),
    close: () => { for (const { original } of scopes) database.run(`DROP TABLE temp.${original}`); },
  };
}
