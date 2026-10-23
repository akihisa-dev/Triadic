import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "../../Triadichrome-extension/src/extension/HomePage";
import type { HomePageProps } from "../../Triadichrome-extension/src/extension/workspace/types";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import { createSamplePlan } from "./sample-plan";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

if (!import.meta.env.DEV) throw new Error("確認専用画面です。");
const initial = await readPlanContents(await createSamplePlan());
function Preview() {
  const [contents, setContents] = useState(initial);
  const [recovered, setRecovered] = useState("");
  const props = {
    initialContents: contents, fileName: "確認.triadic", dataHistory: { entries: [], dirtySince: null }, historyError: "", historyBusy: false,
    canUndo: false, canRedo: false, operationRevision: 0,
    onPrepareSave: async () => {}, onCloseFile: () => {}, onRetryHistory: async () => {}, onDeleteHistory: async () => {},
    onChangePlan: async () => contents, onChangeMaster: async () => contents, onChangePeriodTypes: async () => contents,
    onChangeDepartments: async () => contents, onChangeIndustries: async () => contents, onChangeExpansionCategories: async () => contents,
    onChangeExpansions: async () => contents, onChangeAggregations: async () => contents,
    onUpdateInitiative: async () => { throw new Error("編集元の施策は削除されました。"); },
    onRegisterInitiative: async (draft: { name: string }) => { setRecovered(draft.name); return contents; },
    onSaveAs: async () => contents, onCompareHistory: async () => ({ sections: [] }), onPreviewHistory: async () => contents,
    onRestoreHistory: async () => contents, onTravelOperation: async () => contents,
  } as unknown as HomePageProps;
  return <><button onClick={() => setContents({ ...contents, initiatives: contents.initiatives.filter(item => item.id !== initial.initiatives[0]!.id) })}>外部で施策を削除</button>
    <output aria-label="引き継いだ施策">{recovered}</output><HomePage {...props} /></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
