import { useState } from "react";
import { createRoot } from "react-dom/client";
import { InitiativeListPage } from "../../Triadichrome-extension/src/extension/InitiativeListPage";
import type { Account } from "../../Triadichrome-extension/src/core/domain/accountMaster";
import { InitiativeAmountGrid } from "../../Triadichrome-extension/src/extension/InitiativeAmountGrid";
import type { InitiativeEntryDraft } from "../../Triadichrome-extension/src/core/domain/plan";
import type { KindId } from "../../Triadichrome-extension/src/core/domain/kinds";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
function Preview() {
  const [kind, setKind] = useState<KindId>(2);
  const [list, setList] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [draft, setDraft] = useState<InitiativeEntryDraft>({ name: "確認用", note: "", expansionId: 1, fiscalYear: "2026", rows: [
    { id: "a", accountId: 1, amounts: { 4: "100", 5: "0.001", 6: "-2" }, overrides: { 2: { 4: "0", 5: "0.002", 6: "-2", 3: "1" } } },
    { id: "b", accountId: 2, amounts: { 4: "-0.001" } },
    { id: "c", accountId: 2, amounts: {} },
  ] });
  const accounts: Account[] = [
    { id: 1, accountCode: "001", accountName: "売上高", accountType: "sales", inUse: true },
    { id: 2, accountCode: "002", accountName: "確認対象", accountType: fixed ? "expense" : null, inUse: true },
  ];
  return <main><h1>予算の確認表示</h1>
    <button onClick={() => setKind(kind === 1 ? 2 : 1)}>{kind === 1 ? "確定予算へ" : "一次予算へ"}</button>
    <button onClick={() => setFixed(!fixed)}>属性を切替</button>
    <button onClick={() => setList(!list)}>{list ? "入力へ" : "一覧へ"}</button>
    {list ? <InitiativeListPage selection={null} selectedKind={kind} initiatives={[{ ...draft, id: 1, fiscalYear: 2026, revision: 0, startYearMonths: {1: "", 2: ""} }]}
      accounts={accounts} expansions={[]} periodTypes={[]} fiscalYear="2026" onAddInitiative={() => setList(false)} onOpenInitiative={() => setList(false)} navigationBlocked={false}/>
      : <div className="initiative-amount-table-container"><InitiativeAmountGrid draft={draft} kind={kind} accounts={accounts} isSaving={false} onDraftChange={setDraft}/></div>}
  </main>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
