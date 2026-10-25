import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PreviousInputPage } from "../../Triadic-extension/src/extension/PreviousInputPage";
import { PeriodMasterPage } from "../../Triadic-extension/src/extension/PeriodMasterPage";
import { AccountMasterPage } from "../../Triadic-extension/src/extension/AccountMasterPage";
import { createTriadicDatabase } from "../../Triadic-extension/src/core/storage/triadicDatabase";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import { changeDepartmentMaster } from "../../Triadic-extension/src/core/storage/departmentMaster";
import { changePeriodMaster } from "../../Triadic-extension/src/core/storage/periodMaster";
import { changeAccountMaster } from "../../Triadic-extension/src/core/storage/accountMaster";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const screen = new URLSearchParams(location.search).get("screen") ?? "previous";
let bytes = await createTriadicDatabase(2026);
bytes = await changeDepartmentMaster(bytes, { type: "add", departmentName: "保持元部署", industryIds: [1] });
bytes = await changePeriodMaster(bytes, { type: "add", periodName: "保持元期間" });
bytes = (await changeAccountMaster(bytes, { type: "add", accountCode: "999", accountName: "保持元科目", accountType: "expense" })).bytes;
const initial = await readPlanContents(bytes);
const id = screen === "previous" ? initial.departments.at(-1)!.id : screen === "named" ? initial.periodTypes.at(-1)!.id : initial.accounts.at(-1)!.id;
function Preview() {
  const [contents, setContents] = useState(initial);
  const [attempts, setAttempts] = useState(0);
  const [removed, setRemoved] = useState(false);
  const save = async () => { setAttempts(value => value + 1); throw new Error("確認用の保存失敗"); };
  const publish = async () => setContents(await readPlanContents(bytes));
  const props = { onBack() {}, onPendingChange() {}, onPrepareSave: async () => {}, isSaving: false };
  return <><header><button disabled={removed} onClick={() => { void (async () => {
    if (screen === "previous") bytes = await changeDepartmentMaster(bytes, { type: "delete", id });
    else if (screen === "named") bytes = await changePeriodMaster(bytes, { type: "delete", id });
    else bytes = (await changeAccountMaster(bytes, { type: "delete", id })).bytes;
    setRemoved(true); await publish();
  })(); }}>別画面で対象を削除</button>
    <button disabled={!removed} onClick={() => { void (async () => {
      if (screen === "previous") bytes = await changeDepartmentMaster(bytes, { type: "add", departmentName: "作り直した部署", industryIds: [1] });
      else if (screen === "named") bytes = await changePeriodMaster(bytes, { type: "add", periodName: "作り直した期間" });
      else bytes = (await changeAccountMaster(bytes, { type: "add", accountCode: "999", accountName: "作り直した科目", accountType: "expense" })).bytes;
      await publish();
    })(); }}>別画面で対象を再登録</button>
    <output aria-label="保存試行回数">{attempts}</output></header>
    {screen === "previous" ? <PreviousInputPage {...props} contents={contents} onSave={save} />
      : screen === "named" ? <PeriodMasterPage {...props} periodTypes={contents.periodTypes} onChange={save} />
      : <AccountMasterPage {...props} accounts={contents.accounts} groups={contents.aggregations} usedAccountIds={new Set()} onChange={save} onChangeAggregations={save} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
