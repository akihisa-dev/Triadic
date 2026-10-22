import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DetailEditorPage } from "../../Triadichrome-extension/src/extension/DetailsPage";
import { createTriadicDatabase } from "../../Triadichrome-extension/src/core/storage/triadicDatabase";
import { changeDetailDocument } from "../../Triadichrome-extension/src/core/storage/detailDocuments";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import type { DetailDocument } from "../../Triadichrome-extension/src/core/domain/detailDocuments";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
let bytes = await changeDetailDocument(await createTriadicDatabase(2026), { type: "create", document: {
  id: "00000000-0000-4000-8000-000000000001", name: "共有更新の確認", revision: 0,
  parts: [
    { id: "a", kind: "text", x: 0, y: 0, width: 168, height: 96, text: "自分の元の文章" },
    { id: "b", kind: "text", x: 192, y: 0, width: 168, height: 96, text: "別画面の元の文章" },
  ],
} });
const read = async () => (await readPlanContents(bytes)).detailDocuments[0]!;
const initial = await read();

function Preview() {
  const [document, setDocument] = useState(initial);
  const [attempts, setAttempts] = useState<DetailDocument[]>([]);
  const [waiting, setWaiting] = useState(false);
  const hold = useRef(false), release = useRef<(() => void) | undefined>(undefined);
  const publish = async () => { const saved = await read(); flushSync(() => setDocument(saved)); };
  return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <header style={{ padding: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button onClick={() => { hold.current = true; }}>次の保存を保留</button>
      <button disabled={!waiting} onClick={() => release.current?.()}>保存を完了</button>
      <button onClick={() => { void (async () => {
        const latest = await read();
        bytes = await changeDetailDocument(bytes, { type: "update", document: { ...latest,
          parts: latest.parts.map(part => part.id === "b" && part.kind === "text" ? { ...part, text: "別画面の保存済み文章" } : part),
        } });
        await publish();
      })(); }}>別画面で文章を変更</button>
      <output role="status">{waiting ? "保存を保留中" : "操作できます"}</output>
    </header>
    <div style={{ flex: 1, minHeight: 0 }}><DetailEditorPage document={document} disabled={false}
      onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}} initiatives={[]} onOpenInitiative={() => {}}
      onSave={async draft => {
        setAttempts(current => [...current, draft]);
        if (hold.current) {
          hold.current = false; setWaiting(true);
          await new Promise<void>(resolve => { release.current = resolve; }); setWaiting(false);
        }
        bytes = await changeDetailDocument(bytes, { type: "update", document: draft });
        await publish();
      }} /></div>
    <pre aria-label="SQLite保存内容" style={{ maxHeight: 65, overflow: "auto", margin: 4 }}>{JSON.stringify(document)}</pre>
    <pre aria-label="送信した更新番号" style={{ margin: 4 }}>{JSON.stringify(attempts.map(item => item.revision))}</pre>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
