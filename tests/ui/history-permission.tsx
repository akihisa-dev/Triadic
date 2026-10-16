import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { DataHistoryPage } from "../../Triadichrome-extension/src/extension/DataHistoryPage";
import { PlanSession } from "../../Triadichrome-extension/src/extension/PlanSession";
import { createSamplePlan } from "./sample-plan";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

let bytes = await createSamplePlan(2026);
let writable = true;
let allowRequest = false;
let requests = 0;
const destination = async (): Promise<FileSystemFileHandle> => { throw new Error("保存先を選び直しません。"); };
const handle = {
  name: "履歴削除の許可確認.triadic",
  queryPermission: async () => writable ? "granted" : "prompt",
  requestPermission: async () => { requests++; writable = allowRequest; return writable ? "granted" : "denied"; },
  getFile: async () => new File([new Uint8Array(bytes)], handle.name),
  createWritable: async () => {
    if (!writable) throw new Error("書込許可なし");
    let pending: Uint8Array | undefined;
    return { async write(value: Uint8Array) { pending = new Uint8Array(value); }, async close() { if (!pending) throw new Error("未書込"); bytes = pending; }, async abort() {} };
  },
} as unknown as FileSystemFileHandle;
const session = new PlanSession();
await session.open({ bytes, name: handle.name, handle });
function Preview() {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [permission, setPermission] = useState("許可あり");
  return <>
    <button onClick={() => { writable = false; allowRequest = false; setPermission("許可失効・要求は拒否"); }}>書込許可を失効</button>
    <button onClick={() => { allowRequest = true; setPermission("次の許可要求を承認"); }}>次の許可を承認</button>
    <output aria-label="許可状態">{permission}</output><output aria-label="許可要求回数">{requests}</output>
    <DataHistoryPage entries={snapshot.history.entries} busy={snapshot.busy} error={snapshot.historyError}
      onPreview={async () => {}} onDelete={deletion => session.deleteHistory(deletion, destination)}
      onPrepareSave={() => session.prepareSave(destination)}
      onRetry={async () => { await session.prepareSave(destination); await session.checkpoint(true, destination); }} />
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
