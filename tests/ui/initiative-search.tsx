import { createRoot } from "react-dom/client";
import { useState } from "react";
import { InitiativeSearch } from "../../Triadic-extension/src/extension/InitiativeSearch";
import type { Initiative } from "../../Triadic-extension/src/core/domain/plan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";

const items: Initiative[] = Array.from({ length: 125 }, (_, id) => ({ id, name: `確認施策${id + 1}`, note: id === 124 ? "<img src=x onerror=alert(1)> ＡＢＣ ｺｽﾄ" : "共通の備考",
  expansionId: null, fiscalYear: 2026, rows: [], revision: 1, startYearMonths: { 1: "", 2: "" }, months: {} }));
function Preview() {
  const [empty, setEmpty] = useState(false), [selected, setSelected] = useState("");
  return <><button onClick={() => setEmpty(!empty)}>対象を切り替え</button><output aria-label="移動先">{selected}</output>
    <InitiativeSearch initiatives={empty ? [] : items} disabled={false} onOpen={item => setSelected(item.name)} /></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
