import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PreviousAmountGrid } from "../../Triadic-extension/src/extension/PreviousAmountGrid";
import { createTriadicDatabase } from "../../Triadic-extension/src/core/storage/triadicDatabase";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import { savePreviousAmounts } from "../../Triadic-extension/src/core/storage/settings";
import { changeAccountMaster } from "../../Triadic-extension/src/core/storage/accountMaster";
import { rebasePlan } from "../../Triadic-extension/src/core/storage/rebasePlan";
import { createPreviousInput } from "../../Triadic-extension/src/core/domain/previousAmounts";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const initial = (await changeAccountMaster(await createTriadicDatabase(2026), {type:"add", accountCode:"998", accountName:"削除確認科目", accountType:"expense"})).bytes;
const initialContents = await readPlanContents(initial);
const a = initialContents.accounts[0]!, b = initialContents.accounts[1]!;
const input = createPreviousInput(initialContents, 1, 1);
const base = await savePreviousAmounts(initial, { ...input, rows: input.rows.map(row => ({ ...row, amounts: {4: row.accountId === a.id ? "100" : row.accountId === b.id ? "200" : "0"} })) });
const contents = await readPlanContents(base);
function Preview() {
  const [plan, setPlan] = useState(contents);
  const [draft, setDraft] = useState(createPreviousInput(contents, 1, 1));
  const [status, setStatus] = useState("操作できます");
  const apply = async (action: string) => {
    try {
      const local = await savePreviousAmounts(base, draft);
      let external: Uint8Array;
      if (action === "並び替え") external = (await changeAccountMaster(base, {type:"reorder", ids:[b.id, a.id, ...contents.accounts.slice(2).map(row => row.id)]})).bytes;
      else if (action === "挿入") external = (await changeAccountMaster(base, {type:"add", accountCode:"999", accountName:"追加科目", accountType:"expense"})).bytes;
      else if (action === "削除") external = (await changeAccountMaster(base, {type:"delete", id:contents.accounts.at(-1)!.id})).bytes;
      else external = (await changeAccountMaster(base, {type:"update", id:b.id, accountCode:b.accountCode!, accountName:b.accountName, accountType:"expense", ...(b.displayName === undefined ? {} : {displayName:b.displayName})})).bytes;
      const merged = await rebasePlan(base, local, external);
      if (!merged) throw new Error("統合できません");
      const saved = await readPlanContents(merged.bytes);
      setPlan(saved); setDraft(createPreviousInput(saved, 1, 1)); setStatus(`${action}の保存統合完了`);
    } catch (error) {setStatus(String(error));}
  };
  return <main><h1>前年表の選択と保存統合</h1>
    {["並び替え", "挿入", "削除", "属性変更"].map(action => <button key={action} onMouseDown={event => event.preventDefault()} onClick={() => void apply(action)}>{action}を統合</button>)}
    <output>{status}</output>
    <PreviousAmountGrid contents={plan} draft={draft} onChange={setDraft}/>
    <pre aria-label="入力結果">{JSON.stringify(draft.rows.filter(row => row.accountId === a.id || row.accountId === b.id))}</pre>
  </main>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
