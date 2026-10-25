import { createRoot } from "react-dom/client";
import { useState } from "react";
import { InitiativeSearch } from "../../Triadic-extension/src/extension/InitiativeSearch";
import type { Initiative, PlanContents } from "../../Triadic-extension/src/core/domain/plan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";

const items: Initiative[] = Array.from({ length: 125 }, (_, id) => ({ id, name: `確認施策${id + 1}`, note: id === 124 ? "<img src=x onerror=alert(1)> ＡＢＣ ｺｽﾄ" : "共通の備考",
  expansionId: 0, expansionCategoryId: -1, departmentId: id === 124 ? 3 : 4, industryId: 5, periodTypeId: 6, fiscalYear: 2026, rows: [], revision: 1, startYearMonths: { 1: "", 2: "" }, months: {} }));
const masters = {
  expansions: [{ id: 0, expansionCode: "0", expansionName: "コスト" }],
  expansionCategories: [{ id: -1, categoryName: "運行効率化" }],
  departments: [{ id: 3, departmentName: "運輸部", industryIds: [5] }, { id: 4, departmentName: "倉庫部", industryIds: [5] }],
  industries: [{ id: 5, industryCode: "5", industryName: "一般貨物ＸＹＺ" }],
  periodTypes: [{ id: 6, periodName: "上期" }],
} satisfies Pick<PlanContents, "expansions" | "expansionCategories" | "departments" | "industries" | "periodTypes">;
function Preview() {
  const [renamed, setRenamed] = useState(false);
  const [empty, setEmpty] = useState(false), [selected, setSelected] = useState("");
  return <><button onClick={() => setEmpty(!empty)}>対象を切り替え</button><button onClick={() => setRenamed(!renamed)}>部署名を更新</button><output aria-label="移動先">{selected}</output>
    <InitiativeSearch initiatives={empty ? [] : items} masters={renamed ? { ...masters, departments: masters.departments.map(item => item.id === 3 ? { ...item, departmentName: "配送部" } : item) } : masters} disabled={false} onOpen={item => setSelected(item.name)} /></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
