import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExpansionTablePage } from "../../Triadichrome-extension/src/extension/ExpansionTablePage";
import { createSamplePlan } from "./sample-plan";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import type { KindId } from "../../Triadichrome-extension/src/core/domain/kinds";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";
const base = await readPlanContents(await createSamplePlan(2026));
const count = Number(new URLSearchParams(location.search).get("count") ?? 1000);
const contents = { ...base, initiatives: Array.from({ length: count }, (_, index) => ({ ...base.initiatives[0]!, id: index + 1,
  name: `施策${String(index).padStart(3, "0")}`, expansionId: index < 40 ? 1 : 2,
  periodTypeId: base.periodTypes[index < 20 ? 0 : 1]!.id,
  expansionCategoryId: index < 10 ? base.expansionCategories[0]!.id : null,
})) };
function Preview() {
  const [kind, setKind] = useState<KindId>(1);
  const [opened, setOpened] = useState("");
  return <>
    <button onClick={() => setKind(kind === 1 ? 2 : 1)}>種別切替</button>
    <ExpansionTablePage contents={contents} selected={[kind]} selection={null} onOpenInitiative={item => setOpened(`${item.id}:${item.name}`)} />
    <output aria-label="開いた施策">{opened}</output>
  </>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
