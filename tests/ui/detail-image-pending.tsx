import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { DetailEditorPage } from "../../Triadichrome-extension/src/extension/DetailsPage";
import { PlanSession } from "../../Triadichrome-extension/src/extension/PlanSession";
import { useMutation } from "../../Triadichrome-extension/src/extension/useMutation";
import { flushAutoSaves } from "../../Triadichrome-extension/src/extension/flushAutoSaves";
import { createTriadicDatabase } from "../../Triadichrome-extension/src/core/storage/triadicDatabase";
import { changeDetailDocument } from "../../Triadichrome-extension/src/core/storage/detailDocuments";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const initial = await changeDetailDocument(await createTriadicDatabase(2026), { type: "create", document: {
  id: "00000000-0000-4000-8000-000000000003", name: "画像読込の確認", revision: 0,
  parts: [{ id: "image", kind: "image", x: 0, y: 0, width: 336, height: 240, src: "", name: "" }],
} });
function memoryFile(name: string, initial: Uint8Array) {
  let bytes = initial;
  const handle = { name, isSameEntry: async (other: unknown) => other === handle, queryPermission: async () => "granted",
    getFile: async () => new File([bytes.slice().buffer], name), createWritable: async () => {
      let next = bytes; return { write: async (data: ArrayBuffer) => { next = new Uint8Array(data).slice(); }, close: async () => { bytes = next; }, abort: async () => {} };
    } } as unknown as FileSystemFileHandle;
  return { handle, read: () => bytes };
}
const original = memoryFile("画像.triadic", initial), copy = memoryFile("画像コピー.triadic", new Uint8Array());
const session = new PlanSession();
await session.open({ name: original.handle.name, handle: original.handle, bytes: initial });
const destination = async () => original.handle;
function Preview() {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const document = snapshot.contents!.detailDocuments[0]!;
  const mutation = useMutation();
  const [result, setResult] = useState("");
  const [captured, setCaptured] = useState("");
  const [visible, setVisible] = useState(true);
  const actions = ["別名保存", "保存取消", "操作取消", "画面移動", "履歴移動"];
  return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <header>{actions.map(action => <button key={action} disabled={mutation.busy} onClick={() => {
      void mutation.run(async () => {
        setResult("待機中"); await flushAutoSaves();
        setCaptured(JSON.stringify(session.getSnapshot().contents!.detailDocuments[0]));
        if (action === "別名保存") {
          await session.saveAs(async () => copy.handle);
          setCaptured(JSON.stringify((await readPlanContents(copy.read())).detailDocuments[0]));
        } else if (action === "操作取消") await session.travelOperation(-1, destination);
        else if (action === "保存取消") {
          try { await session.saveAs(async () => { throw new DOMException("取消", "AbortError"); }); }
          catch (error) { if (!(error instanceof DOMException) || error.name !== "AbortError") throw error; }
        } else setVisible(false);
        setResult(`${action}完了`);
      }).catch(error => setResult(String(error)));
    }}>{action}</button>)}</header>
    {visible && <div style={{ flex: 1, minHeight: 0 }}><DetailEditorPage document={document} disabled={mutation.busy}
      onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}} initiatives={[]} onOpenInitiative={() => {}}
      onSave={async draft => { await session.dispatch({ type: "detail", change: { type: "update", document: draft } }, destination); }} /></div>}
    <output role="status">{result}</output>
    <pre aria-label="操作時の保存内容">{captured}</pre>
    <pre aria-label="SQLite保存内容">{JSON.stringify(document)}</pre>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
