import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DetailEditorPage } from "../../Triadichrome-extension/src/extension/DetailsPage";
import { createTriadicDatabase } from "../../Triadichrome-extension/src/core/storage/triadicDatabase";
import { changeDetailDocument } from "../../Triadichrome-extension/src/core/storage/detailDocuments";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import type { DetailPart } from "../../Triadichrome-extension/src/core/tables/detailParts";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const vertical = new URLSearchParams(location.search).has("vertical");
const row = (name: string) => [name, ...Array<string>(12).fill("10")];
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
let bytes = await changeDetailDocument(await createTriadicDatabase(2026), { type: "create", document: {
  id: "00000000-0000-4000-8000-000000000002", name: "操作競合の確認", revision: 0,
  parts: [
    { id: "a", kind: "text", x: 0, y: 0, width: 168, height: 96, text: "最初の文章A" },
    { id: "b", kind: "text", x: 192, y: 0, width: 168, height: 96, text: "最初の文章B" },
    { id: "image", kind: "image", x: 0, y: 120, width: 168, height: 120, src: "", name: "" },
    { id: "table", kind: vertical ? "table-vertical" : "table-horizontal", x: 0, y: 264, width: vertical ? 696 : 1200, height: 480,
      cells: [row("項目A"), row("項目B")], rowIds: ["row-a", "row-b"], unit: "" },
  ],
} });
const read = async () => (await readPlanContents(bytes)).detailDocuments[0]!;
const initial = await read();

function Preview() {
  const [document, setDocument] = useState(initial);
  const publish = async () => { const saved = await read(); flushSync(() => setDocument(saved)); };
  const external = async (transform: (parts: DetailPart[]) => DetailPart[]) => {
    const current = await read();
    bytes = await changeDetailDocument(bytes, { type: "update", document: { ...current, parts: transform(current.parts) } });
    await publish();
  };
  const tableChange = (kind: "insert" | "remove" | "update") => external(parts => parts.map(part => {
    if (part.kind !== "table-horizontal" && part.kind !== "table-vertical") return part;
    return { ...part, cells: kind === "insert" ? [row("新しい項目"), ...part.cells] : kind === "remove" ? part.cells.slice(1) : part.cells.map((cells, index) => index === 1 ? row("更新した項目B") : cells),
      rowIds: kind === "insert" ? ["row-new", ...part.rowIds] : kind === "remove" ? part.rowIds.slice(1) : part.rowIds };
  }));
  return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <header style={{ padding: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
      <button onClick={() => { void external(parts => parts.map(part => part.kind === "text" ? { ...part, text: `共有更新${part.id}` }
        : part.kind === "image" ? { ...part, src: png, name: "共有画像.png" }
        : part.kind === "table-horizontal" || part.kind === "table-vertical" ? { ...part, cells: [row("共有表A"), row("共有表B")] } : part)); }}>共有内容を更新</button>
      <button onClick={() => { void external(parts => parts.map(part => part.id === "a" ? { ...part, x: 24 } : part)); }}>共有配置を更新</button>
      <button onClick={() => { void external(parts => parts.map(part => part.id === "a" && part.kind === "text" ? { ...part, text: "無関係の共有文章" } : part)); }}>文章だけ更新</button>
      <button onClick={() => { void tableChange("insert"); }}>表の先頭に追加</button>
      <button onClick={() => { void tableChange("remove"); }}>表の先頭を削除</button>
      <button onClick={() => { void tableChange("update"); }}>表の対象を更新</button>
    </header>
    <div style={{ flex: 1, minHeight: 0 }}><DetailEditorPage document={document} disabled={false}
      onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}} initiatives={[]} onOpenInitiative={() => {}}
      onSave={async draft => { bytes = await changeDetailDocument(bytes, { type: "update", document: draft }); await publish(); }} /></div>
    <pre aria-label="SQLite保存内容" style={{ maxHeight: 50, overflow: "auto", margin: 4 }}>{JSON.stringify(document)}</pre>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
