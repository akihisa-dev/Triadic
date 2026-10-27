import type { Database } from "./sqliteRuntime";
import { editDatabase } from "./transaction";
import { validateExpansionChange, type Expansion, type ExpansionChange } from "../domain/expansionMaster";
export function listExpansions(database: Database): Expansion[] {
  const assignments = new Map<number, number[]>();
  for (const [expansion, category] of database.exec("SELECT expansion_id, category_id FROM expansion_category_assignments ORDER BY category_id")[0]?.values ?? []) {
    const ids = assignments.get(Number(expansion)) ?? []; ids.push(Number(category)); assignments.set(Number(expansion), ids);
  }
  return (database.exec("SELECT id, code, name FROM expansions ORDER BY length(code), code, id")[0]?.values ?? [])
    .map(([id, code, name]) => ({ id: Number(id), expansionCode: String(code), expansionName: String(name), categoryIds: assignments.get(Number(id)) ?? [] }));
}

export async function changeExpansionMaster(bytes: Uint8Array, change: ExpansionChange): Promise<Uint8Array> {
  return (await editDatabase(bytes, database => applyExpansionChange(database, change))).bytes;
}

export function applyExpansionChange(database: Database, change: ExpansionChange): void {
  validateExpansionChange(listExpansions(database), change);
  if (change.type === "delete" && database.exec("SELECT id FROM initiatives WHERE expansion_id = ? LIMIT 1", [change.id]).length) throw new Error("施策で使用している展開名は削除できません。");
  if (change.type === "delete" && database.exec("SELECT category_id FROM expansion_category_assignments WHERE expansion_id = ? LIMIT 1", [change.id]).length) throw new Error("展開区分が所属している展開名は削除できません。先に展開区分マスタで所属を変更するか、区分を削除してください。");
  if (change.type === "delete") database.run("DELETE FROM expansions WHERE id = ?", [change.id]);
  else if (change.type === "add") database.run("INSERT INTO expansions (code, name) VALUES (?, ?)", [change.expansionCode.trim(), change.expansionName.trim()]);
  else database.run("UPDATE expansions SET code = ?, name = ? WHERE id = ?", [change.expansionCode.trim(), change.expansionName.trim(), change.id]);
}
