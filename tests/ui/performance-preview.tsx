import { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";
import { createSamplePlan } from "./sample-plan";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import { PreviousAmountGrid } from "../../Triadichrome-extension/src/extension/PreviousAmountGrid";
import { InitiativeAmountGrid } from "../../Triadichrome-extension/src/extension/InitiativeAmountGrid";
import { ExpansionTablePage } from "../../Triadichrome-extension/src/extension/ExpansionTablePage";
import { initiativeMonths } from "../../Triadichrome-extension/src/core/domain/calendar";
import type { PreviousInput } from "../../Triadichrome-extension/src/core/domain/kinds";
import type { KindId } from "../../Triadichrome-extension/src/core/domain/kinds";
import type { Account } from "../../Triadichrome-extension/src/core/domain/accountMaster";
import { reflectPrimaryBudget } from "../../Triadichrome-extension/src/core/tables/initiativeGrid";
import type { InitiativeEntryDraft } from "../../Triadichrome-extension/src/core/domain/plan";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";
const params = new URLSearchParams(location.search), count = Number(params.get("count") ?? 100), mode = params.get("mode") ?? "previous";
const base = await readPlanContents(await createSamplePlan(2026));
const accounts = Array.from({length: count}, (_, i) => ({...base.accounts[0]!, id: i + 1, accountCode: String(i+1).padStart(3, "0"), accountName: params.has("sameNames") && i < 2 ? "同名科目" : `科目${i}`}));
const contents = {...base, accounts, previousAmounts: [], initiatives: Array.from({length: count}, (_, i) => ({...base.initiatives[0]!, id: i + 1, name: `施策${i}`, expansionId: base.expansions[0]!.id}))};
const measurements: { phase: string; actualMs: number; baseMs: number }[] = [];
Object.assign(window, { gridMeasurements: measurements });
const totalsObservation = { attributeReads: 0 };
Object.assign(window, { totalsObservation });
const traceAccounts = (source: Account[]) => source.map(account => {
  const type = account.accountType;
  return Object.defineProperty({ ...account }, "accountType", { enumerable: true, get() { totalsObservation.attributeReads++; return type; } });
});
const initialDraft = { ...base.initiatives[0]!, fiscalYear: "2026", rows: Array.from({length: Math.min(count,Number(params.get("rows") ?? 200))}, (_, i)=>({id:String(i+1),accountId:accounts[i]!.id, amounts: Object.fromEntries(initiativeMonths.map(m=>[m,"0"]))})) };
function Preview() {
 const [previous, setPrevious] = useState<PreviousInput>({industryId: 1, departmentId: 1, rows: accounts.map(a => ({accountId: a.id, amounts: Object.fromEntries(initiativeMonths.map(m=>[m,"0"]))}))});
 const [draft, setDraft] = useState<InitiativeEntryDraft>(initialDraft);
 const [kind, setKind] = useState<KindId>(1);
 const [gridAccounts, setGridAccounts] = useState(() => params.has("traceTotals") ? traceAccounts(accounts) : accounts);
 // Optional regression guard: a monthly cell must never linearly search all input rows.
 if (params.has("guard")) Object.defineProperty(previous.rows, "find", { configurable: true, value: () => { throw new Error("入力行の繰り返し検索"); } });
 return <>
  {params.has("traceTotals") && <div aria-label="合計の確認操作">
   <button onClick={() => setDraft({ ...draft, note: "備考だけ変更" })}>備考変更</button>
   <button onClick={() => setKind(kind === 1 ? 2 : 1)}>種別変更</button>
   <button onClick={() => setDraft({ ...draft, invalidNumbers: !draft.invalidNumbers })}>入力不備変更</button>
   <button onClick={() => setGridAccounts(traceAccounts(accounts.map(account => ({ ...account, accountType: "expense" }))))}>属性変更</button>
   <button onClick={() => setDraft(reflectPrimaryBudget(draft))}>一次反映</button>
   <button onClick={() => setDraft(initialDraft)}>保存基準へ戻す</button>
  </div>}
  <Profiler id="grid" onRender={(_,phase,actualMs,baseMs)=>measurements.push({phase,actualMs,baseMs})}>
   {mode === "previous" ? <PreviousAmountGrid contents={contents} draft={previous} onChange={setPrevious}/> : mode === "initiative" ? <InitiativeAmountGrid draft={draft} kind={kind} accounts={gridAccounts} isSaving={false} onDraftChange={setDraft}/> : <ExpansionTablePage contents={contents} selected={[1,2]} selection={null} onOpenInitiative={()=>{}} />}
  </Profiler>
 </>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
