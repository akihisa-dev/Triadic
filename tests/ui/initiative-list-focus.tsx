import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { InitiativeListPage, type InitiativeListReturn } from "../../Triadichrome-extension/src/extension/InitiativeListPage";
import { InitiativeDetailPage } from "../../Triadichrome-extension/src/extension/InitiativeDetailPage";
import type { Initiative } from "../../Triadichrome-extension/src/core/domain/plan";
import { HistoryReadOnlyContext } from "../../Triadichrome-extension/src/extension/HistoryReadOnly";
import { createSamplePlan } from "./sample-plan";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import type { KindId } from "../../Triadichrome-extension/src/core/domain/kinds";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

const params = new URLSearchParams(location.search);
const count = Number(params.get("count") ?? 201);
const longNames = params.has("longNames");
const onPendingChange = () => {};
const onPrepareSave = async () => {};
const base = await readPlanContents(await createSamplePlan(2026));
const initiatives = Array.from({ length: count }, (_, index) => ({ ...base.initiatives[0]!, id: index + 1, identity: (index + 1).toString(16).padStart(32, "0"),
  name: `施策${String(index).padStart(3, "0")}${longNames ? "・長い名称でも対象の施策と内容を正確に確認するための事業計画".repeat(3) : ""}`,
  note: longNames ? index % 2 === 0 ? "名称とは異なる備考の内容" : "" : base.initiatives[0]!.note }));

function Preview() {
  const returnTo = useRef<InitiativeListReturn | null>(null);
  const [items, setItems] = useState(initiatives);
  const [kind, setKind] = useState<KindId>(1);
  const [past, setPast] = useState(false);
  const [opened, setOpened] = useState("");
  const [detail, setDetail] = useState<Initiative | null>(null);
  return <>
    <button onClick={() => { setKind(kind === 1 ? 2 : 1); setOpened(""); }}>種別切替</button>
    <button onClick={() => { setPast(!past); setOpened(""); }}>過去と現在を切替</button>
    <HistoryReadOnlyContext value={past}>
      {detail ? <InitiativeDetailPage initiative={detail} accounts={base.accounts}
        expansions={base.expansions} expansionCategories={base.expansionCategories} departments={base.departments}
        periodTypes={base.periodTypes} industries={base.industries}
        onUpdate={async () => {}} onBack={() => {
          if (params.has("deleted")) setItems(items.filter(item => item.id !== detail.id));
          if (params.has("recreated")) setItems(items.map(item => item.id === detail.id ? { ...item, identity: "f".repeat(32) } : item));
          setDetail(null);
        }} onOpenMaster={() => {}}
        onPendingChange={onPendingChange} onPrepareSave={onPrepareSave} /> : <InitiativeListPage returnTo={returnTo} selection={null} selectedKind={kind}
        initiatives={past ? [...items].reverse() : items} accounts={base.accounts}
        expansions={base.expansions} periodTypes={base.periodTypes} fiscalYear="2026"
        onAddInitiative={() => {}} onOpenInitiative={item => { setOpened(`${item.id}:${item.name}`); if (longNames) setDetail(item); }} navigationBlocked={false} />}
    </HistoryReadOnlyContext>
    <output aria-label="開いた施策">{opened}</output>
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
