import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExpansionMasterPage } from "../../Triadic-extension/src/extension/ExpansionMasterPage";
import { changeExpansionMaster } from "../../Triadic-extension/src/core/storage/expansionMaster";
import { PeriodMasterPage } from "../../Triadic-extension/src/extension/PeriodMasterPage";
import { AggregationMasterPage } from "../../Triadic-extension/src/extension/AggregationMasterPage";
import { createTriadicDatabase } from "../../Triadic-extension/src/core/storage/triadicDatabase";
import { changePeriodMaster } from "../../Triadic-extension/src/core/storage/periodMaster";
import { changeAggregationMaster } from "../../Triadic-extension/src/core/storage/aggregationMaster";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const aggregation = new URLSearchParams(location.search).has("aggregation");
const expansion = new URLSearchParams(location.search).has("expansion");
let bytes = await createTriadicDatabase(2026);
bytes = expansion ? await changeExpansionMaster(bytes, { type: "add", expansionCode: "99", expansionName: "確認した対象" }) : aggregation ? await changeAggregationMaster(bytes, { type: "add", name: "確認した対象" })
  : await changePeriodMaster(bytes, { type: "add", periodName: "確認した対象" });
const initial = await readPlanContents(bytes);
function Preview() {
  const [contents, setContents] = useState(initial);
  const publish = async () => setContents(await readPlanContents(bytes));
  const replace = async () => {
    if (expansion) {
      const id = contents.expansions.at(-1)!.id;
      bytes = await changeExpansionMaster(bytes, { type: "delete", id });
      bytes = await changeExpansionMaster(bytes, { type: "add", expansionCode: "100", expansionName: "作り直した対象" });
    } else if (aggregation) {
      const id = contents.aggregations.at(-1)!.id;
      bytes = await changeAggregationMaster(bytes, { type: "delete", id });
      bytes = await changeAggregationMaster(bytes, { type: "add", name: "作り直した対象" });
    } else {
      const id = contents.periodTypes.at(-1)!.id;
      bytes = await changePeriodMaster(bytes, { type: "delete", id });
      bytes = await changePeriodMaster(bytes, { type: "add", periodName: "作り直した対象" });
    }
    await publish();
  };
  return <><header><button onClick={() => { void replace(); }}>別画面で対象を作り直す</button>
    <button onClick={() => { setTimeout(() => { void replace(); }, 1500); }}>別画面の再作成を予約</button></header>
    {expansion ? <ExpansionMasterPage expansions={contents.expansions} expansionCategories={contents.expansionCategories} usedExpansionIds={new Set()} isSaving={false}
      onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}}
      onChange={async change => { bytes = await changeExpansionMaster(bytes, change); await publish(); }} />
      : aggregation ? <AggregationMasterPage accounts={contents.accounts} groups={contents.aggregations} isSaving={false}
      onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}}
      onChange={async change => { bytes = await changeAggregationMaster(bytes, change); await publish(); }} />
      : <PeriodMasterPage periodTypes={contents.periodTypes} isSaving={false}
        onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}}
        onChange={async change => { bytes = await changePeriodMaster(bytes, change); await publish(); }} />}
    <pre aria-label="保存された対象">{JSON.stringify(expansion ? contents.expansions.map(row => row.expansionName) : aggregation ? contents.aggregations.map(row => row.name) : contents.periodTypes.map(row => row.periodName))}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
