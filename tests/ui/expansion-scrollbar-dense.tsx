import { createRoot } from "react-dom/client";
import { ExpansionTablePage } from "../../Triadic-extension/src/extension/ExpansionTablePage";
import { createSamplePlan } from "./sample-plan";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";

const base = await readPlanContents(await createSamplePlan(2026));
const params = new URLSearchParams(location.search);
const rows = params.get("virtual") === "true" ? 80 : 40;
const names = ["価格改定", "新規開拓", "取扱拡大", "商品追加", "販路開拓", "契約更新", "顧客紹介", "販売促進", "配送改善", "仕入改善", "在庫削減", "作業改善", "残業削減", "配置見直し", "外注見直し", "燃料削減", "電力削減", "資材削減", "保守改善", "倉庫改善", "輸送改善", "回収改善", "検品改善", "納品改善", "品質改善", "安全対策", "教育研修", "採用強化"];
const groups = [{ name: "既存事業", rows }, ...names.map(name => ({ name, rows: 1 })), { name: "設備更新", rows }];
let id = 0;
const contents = { ...base,
  expansions: groups.map((group, index) => ({ ...base.expansions[0]!, id: index + 1, expansionName: group.name, code: String(index + 1) })),
  initiatives: groups.flatMap((group, index) => Array.from({ length: group.rows }, (_, offset) => ({ ...base.initiatives[0]!, id: ++id,
    name: `${group.name}の施策${offset + 1}`, expansionId: index + 1, periodTypeId: base.periodTypes[0]!.id, expansionCategoryId: null,
  }))),
};
createRoot(document.getElementById("root")!).render(<ExpansionTablePage contents={contents} selected={[1]} selection={null} onOpenInitiative={() => {}} />);
