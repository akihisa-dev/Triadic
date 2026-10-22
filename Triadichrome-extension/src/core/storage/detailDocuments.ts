import { applyDetailBindings } from "./detailBindings";
import { validateDetailDocument, type DetailChange, type DetailDocument } from "../domain/detailDocuments";
import type { Database } from "./sqliteRuntime";
import { editDatabase } from "./transaction";

export function listDetailDocuments(db: Database): DetailDocument[] {
  return (db.exec("SELECT id, name, parts_json, revision FROM detail_documents ORDER BY position, id")[0]?.values ?? []).map(([id, name, parts, revision]) => {
    const document: unknown = { id, name, parts: JSON.parse(String(parts)), revision };
    validateDetailDocument(document);
    return document;
  });
}
export async function changeDetailDocument(bytes: Uint8Array, change: DetailChange, edit = editDatabase): Promise<Uint8Array> {
  return (await edit(bytes, db => {
    validateDetailDocument(change.document);
    const item = change.document;
    const existing = db.exec("SELECT name, parts_json, revision FROM detail_documents WHERE id = ?", [item.id])[0]?.values[0];
    const parts = JSON.stringify(item.parts);
    if (change.type === "create") {
      if (existing || item.revision !== 0) throw new Error("同じ識別子の明細が既にあります。");
      db.run("INSERT INTO detail_documents(id, name, parts_json, revision, position) VALUES (?, ?, ?, 0, (SELECT COALESCE(MAX(position), -1) + 1 FROM detail_documents))", [item.id, item.name, parts]);
    } else {
      if (!existing) throw new Error("編集対象の明細が見つかりません。入力は保持しています。");
      if (existing[0] === item.name && existing[1] === parts) return;
      if (existing[2] !== item.revision) throw new Error("この明細は別の画面で変更されています。入力は保持しています。");
      if (!Number.isSafeInteger(item.revision + 1)) throw new Error("明細の更新回数が上限に達しました。");
      db.run("UPDATE detail_documents SET name = ?, parts_json = ?, revision = revision + 1 WHERE id = ?", [item.name, parts, item.id]);
    }
    applyDetailBindings(db, listDetailDocuments(db));
  })).bytes;
}
