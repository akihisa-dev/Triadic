import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { NamedMasterPage, type NamedMasterRow } from "../../Triadic-extension/src/extension/NamedMasterPage";
import { SavedOperationRevisionContext } from "../../Triadic-extension/src/extension/SavedOperationRevision";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
function Preview() {
  const [rows, setRows] = useState<NamedMasterRow[]>([{id:1,name:"同期確認",code:"99",relationIds:[1]}]);
  const [failure,setFailure] = useState("拒否");
  const [revision,setRevision] = useState(0);
  const [waiting,setWaiting] = useState(false);
  const [hold,setHold] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const first = useRef(true);
  return <><h1>マスタ保存同期の確認</h1><p>最初の保存結果には、別画面で追加した所属「外部追加」が含まれます。</p>
    <label>削除結果<select value={failure} onChange={e=>setFailure(e.target.value)}><option>拒否</option><option>保存失敗</option><option>取消</option><option>成功</option></select></label>
    <label><input type="checkbox" checked={hold} onChange={e=>setHold(e.target.checked)} />保存を一時停止</label>
    <button disabled={!waiting} onClick={()=>release.current?.()}>保存を完了する</button>
    <output>{waiting ? "保存待機中" : "操作できます"}</output>
    <SavedOperationRevisionContext.Provider value={revision}><NamedMasterPage rows={rows} subject="展開" slug="expansion" coded isSaving={false} relationRequired={false} relationLabel="展開区分"
      relationOptions={[{id:1,name:"元の所属"},{id:2,name:"外部追加"},{id:3,name:"追加入力"}]}
      onBack={()=>{}} onPendingChange={()=>{}} onPrepareSave={async()=>{}}
      onChange={async change=>{
        if(change.type==="delete") {
          if(failure==="拒否")throw new Error("施策入力で選択している展開は削除できません。");
          if(failure==="保存失敗")throw new Error("保存できませんでした。");
          if(failure==="取消")throw new DOMException("cancel", "AbortError");
          setRows(items=>items.filter(item=>item.id!==change.id));return;
        }
        if(change.type!=="update")return;
        if(hold){setWaiting(true);await new Promise<void>(resolve=>{release.current=resolve});setWaiting(false)}
        const saved={...change,relationIds:first.current?[...new Set([...(change.relationIds??[]),2])]:change.relationIds??[]};
        flushSync(()=>{setRows([saved]);if(first.current)setRevision(value=>value+1)});
        first.current=false;
      }}/></SavedOperationRevisionContext.Provider>
    <pre aria-label="保存結果">{JSON.stringify(rows)}</pre></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
