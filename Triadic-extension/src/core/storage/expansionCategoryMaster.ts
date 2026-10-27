import type { Database } from "./sqliteRuntime";
import { editDatabase } from "./transaction";
import { validateExpansionCategoryChange, type ExpansionCategory, type ExpansionCategoryChange } from "../domain/expansionCategoryMaster";
export function listExpansionCategories(database: Database): ExpansionCategory[] {
  return (database.exec("SELECT c.id, c.name, a.expansion_id FROM expansion_categories c JOIN expansion_category_assignments a ON a.category_id = c.id ORDER BY c.id")[0]?.values ?? [])
    .map(([id, name, expansion]) => ({ id: Number(id), categoryName: String(name), expansionId: Number(expansion) }));
}
export async function changeExpansionCategoryMaster(bytes: Uint8Array, change: ExpansionCategoryChange): Promise<Uint8Array> {
  return (await editDatabase(bytes, database => applyExpansionCategoryChange(database, change))).bytes;
}

export function applyExpansionCategoryChange(database: Database, change: ExpansionCategoryChange): void {
  validateExpansionCategoryChange(listExpansionCategories(database), change);
  if (change.type === "delete") {
    if (database.exec("SELECT id FROM initiatives WHERE expansion_category_id = ? LIMIT 1", [change.id]).length) throw new Error("施策で使用中の展開区分は削除できません。");
    database.run("DELETE FROM expansion_category_assignments WHERE category_id = ?", [change.id]);
    database.run("DELETE FROM expansion_categories WHERE id = ?", [change.id]);
    return;
  }
  if (!database.exec("SELECT id FROM expansions WHERE id = ?", [change.expansionId]).length) throw new Error("所属する展開名を選択してください。");
  if (change.type === "update") {
    const owner = database.exec("SELECT expansion_id FROM expansion_category_assignments WHERE category_id = ?", [change.id])[0]?.values[0]?.[0];
    if (Number(owner) !== change.expansionId && database.exec("SELECT id FROM initiatives WHERE expansion_category_id = ? LIMIT 1", [change.id]).length) throw new Error("施策で使用中の展開区分は所属する展開名を変更できません。");
    database.run("UPDATE expansion_categories SET name = ? WHERE id = ?", [change.categoryName.trim(), change.id]);
    database.run("UPDATE expansion_category_assignments SET expansion_id = ? WHERE category_id = ?", [change.expansionId, change.id]);
  } else {
    database.run("INSERT INTO expansion_categories (name) VALUES (?)", [change.categoryName.trim()]);
    const id = Number(database.exec("SELECT last_insert_rowid()")[0]!.values[0]![0]);
    database.run("INSERT INTO expansion_category_assignments (expansion_id, category_id) VALUES (?, ?)", [change.expansionId, id]);
  }
}
