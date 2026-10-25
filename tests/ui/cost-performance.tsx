import { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CostTablePage } from "../../Triadic-extension/src/extension/CostTablePage";
import { buildCostTable } from "../../Triadic-extension/src/core/tables/costTable";
import { initiativeMonths } from "../../Triadic-extension/src/core/domain/calendar";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import { createSamplePlan } from "./sample-plan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
const params = new URLSearchParams(location.search);
const count = Number(params.get("count") ?? 10), rows = Number(params.get("rows") ?? 1);
const base = await readPlanContents(await createSamplePlan(2026));
const contents = { ...base, initiatives: Array.from({ length: count }, (_, i) => ({ ...base.initiatives[0]!, id: i+1,
  rows: Array.from({ length: rows }, (_, j) => ({ ...base.initiatives[0]!.rows[0]!, id: `${i}:${j}`, overrides: {},
    amounts: Object.fromEntries(initiativeMonths.map(month => [month, (i+j)%2 ? "-0.001" : "1.003"])) })) })) };
Object.assign(window, { runCost: () => buildCostTable(contents.accounts, contents.aggregations, contents.initiatives, 2026) });
function Probe() { const view = useRef({ industries: [] as number[], departments: [] as number[], top: 0, left: 0 }); const [show, setShow] = useState(false); return <><button onClick={() => setShow(true)}>総原価表を表示</button>{show && <CostTablePage view={view} onOpenInitiative={() => {}} navigationBlocked={false} contents={contents} selected={[1,2]} selection={null}/>}</>; }
createRoot(document.getElementById("root")!).render(<Probe/>);
