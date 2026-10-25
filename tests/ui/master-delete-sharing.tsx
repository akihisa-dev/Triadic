import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PeriodMasterPage } from "../../Triadic-extension/src/extension/PeriodMasterPage";
import { AggregationMasterPage } from "../../Triadic-extension/src/extension/AggregationMasterPage";
import { createTriadicDatabase } from "../../Triadic-extension/src/core/storage/triadicDatabase";
import { changePeriodMaster } from "../../Triadic-extension/src/core/storage/periodMaster";
import { changeAggregationMaster } from "../../Triadic-extension/src/core/storage/aggregationMaster";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const aggregation = new URLSearchParams(location.search).has("aggregation");
let bytes = await createTriadicDatabase(2026);
bytes = aggregation ? await changeAggregationMaster(bytes, { type: "add", name: "確認した対象" })
  : await changePeriodMaster(bytes, { type: "add", periodName: "確認した対象" });
const initial = await readPlanContents(bytes);
function Preview() {
  const [contents, setContents] = useState(initial);
  const publish = async () => setContents(await readPlanContents(bytes));
  return <><header><button onClick={() => { void (async () => {
    if (aggregation) {
      const id = contents.aggregations.at(-1)!.id;
      bytes = await changeAggregationMaster(bytes, { type: "delete", id });
      bytes = await changeAggregationMaster(bytes, { type: "add", name: "作り直した対象" });
    } else {
      const id = contents.periodTypes.at(-1)!.id;
      bytes = await changePeriodMaster(bytes, { type: "delete", id });
      bytes = await changePeriodMaster(bytes, { type: "add", periodName: "作り直した対象" });
    }
    await publish();
  })(); }}>別画面で対象を作り直す</button></header>
    {aggregation ? <AggregationMasterPage accounts={contents.accounts} groups={contents.aggregations} isSaving={false}
      onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}}
      onChange={async change => { bytes = await changeAggregationMaster(bytes, change); await publish(); }} />
      : <PeriodMasterPage periodTypes={contents.periodTypes} isSaving={false}
        onBack={() => {}} onPendingChange={() => {}} onPrepareSave={async () => {}}
        onChange={async change => { bytes = await changePeriodMaster(bytes, change); await publish(); }} />}
    <pre aria-label="保存された対象">{JSON.stringify(aggregation ? contents.aggregations.map(row => row.name) : contents.periodTypes.map(row => row.periodName))}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
