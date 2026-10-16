import { useState } from "react";
import { createRoot } from "react-dom/client";
import { InitiativeListPage } from "../../Triadichrome-extension/src/extension/InitiativeListPage";
import { HistoryReadOnlyContext } from "../../Triadichrome-extension/src/extension/HistoryReadOnly";
import { createSamplePlan } from "./sample-plan";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import type { KindId } from "../../Triadichrome-extension/src/core/domain/kinds";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

const params = new URLSearchParams(location.search);
const count = Number(params.get("count") ?? 201);
const base = await readPlanContents(await createSamplePlan(2026));
const initiatives = Array.from({ length: count }, (_, index) => ({ ...base.initiatives[0]!, id: index + 1,
  name: `施策${String(index).padStart(3, "0")}` }));

function Preview() {
  const [kind, setKind] = useState<KindId>(1);
  const [past, setPast] = useState(false);
  const [opened, setOpened] = useState("");
  return <>
    <button onClick={() => { setKind(kind === 1 ? 2 : 1); setOpened(""); }}>種別切替</button>
    <button onClick={() => { setPast(!past); setOpened(""); }}>過去と現在を切替</button>
    <HistoryReadOnlyContext value={past}>
      <InitiativeListPage selection={null} selectedKind={kind}
        initiatives={past ? [...initiatives].reverse() : initiatives} accounts={base.accounts}
        expansions={base.expansions} periodTypes={base.periodTypes} fiscalYear="2026"
        onAddInitiative={() => {}} onOpenInitiative={item => setOpened(`${item.id}:${item.name}`)} navigationBlocked={false} />
    </HistoryReadOnlyContext>
    <output aria-label="開いた施策">{opened}</output>
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
