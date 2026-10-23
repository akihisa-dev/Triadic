import { PlanSession } from "../../Triadichrome-extension/src/extension/PlanSession";
import { type OpenPlan } from "../../Triadichrome-extension/src/extension/planFile";
import type { PlanCommand } from "../../Triadichrome-extension/src/core/domain/planCommands";
async function writePlanCommand(plan: OpenPlan, command: PlanCommand, destination: () => Promise<FileSystemFileHandle>): Promise<OpenPlan> {
  const session = new PlanSession();
  await session.open(plan);
  const contents = await session.dispatch(command, destination);
  const handle = session.getHandle()!;
  return { ...contents, handle, name: handle.name, bytes: new Uint8Array(await (await handle.getFile()).arrayBuffer()), savedHistory: session.getSnapshot().history };
}
export const saveAccountMaster = (plan: OpenPlan, change: Extract<PlanCommand, { type: "account" }>["change"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "account", change }, destination);
export const saveAggregationMaster = (plan: OpenPlan, change: Extract<PlanCommand, { type: "aggregation" }>["change"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "aggregation", change }, destination);
export const saveDepartmentMaster = (plan: OpenPlan, change: Extract<PlanCommand, { type: "department" }>["change"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "department", change }, destination);
export const saveExpansionMaster = (plan: OpenPlan, change: Extract<PlanCommand, { type: "expansion" }>["change"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "expansion", change }, destination);
export const saveIndustryMaster = (plan: OpenPlan, change: Extract<PlanCommand, { type: "industry" }>["change"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "industry", change }, destination);
export const savePeriodMaster = (plan: OpenPlan, change: Extract<PlanCommand, { type: "period" }>["change"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "period", change }, destination);
export const saveInitiative = (plan: OpenPlan, draft: Extract<PlanCommand, { type: "initiative.register" }>["draft"], destination: () => Promise<FileSystemFileHandle>) => writePlanCommand(plan, { type: "initiative.register", draft }, destination);
export const saveInitiativeUpdate = (plan: OpenPlan, id: number, _year: number | null, draft: Extract<PlanCommand, { type: "initiative.update" }>["draft"]) => writePlanCommand(plan, { type: "initiative.update", id, draft }, async () => { throw new Error("保存先がありません。"); });

export * from "../../Triadichrome-extension/src/extension/PlanSession";
export * from "../../Triadichrome-extension/src/extension/triadicFile";
export * from "../../Triadichrome-extension/src/extension/planFile";
export * from "../../Triadichrome-extension/src/extension/recentFile";
export { processingTasks } from '../../Triadichrome-extension/src/extension/planProcessingTasks';
export { scheduleHistoryCheckpoint } from "../../Triadichrome-extension/src/extension/historyCheckpoint";
export * from "../../Triadichrome-extension/src/extension/fileConflict";
export { preparePlanCommand } from "../../Triadichrome-extension/src/extension/preparePlanCommand";

export { createNewPlanFile } from "../../Triadichrome-extension/src/extension/newPlanFile";
export { readTriadicFile } from "../../Triadichrome-extension/src/extension/readTriadicFile";
export { WindowSessionHub } from "../../Triadichrome-extension/src/extension/WindowSessionHub";
export { registerAutoSave, flushAutoSaves } from "../../Triadichrome-extension/src/extension/flushAutoSaves";

export { WindowPlanSession } from "../../Triadichrome-extension/src/extension/WindowPlanSession";

export { processPreviousWorkbook } from "../../Triadichrome-extension/src/extension/previousWorkbookProcessing";

export { diffPlanContents, applyPlanContentsPatch } from "../../Triadichrome-extension/src/core/domain/planContentsPatch";
export { bindPlanProcessing, processPlan } from "../../Triadichrome-extension/src/extension/planProcessing";
export { latestNavigation } from "../../Triadichrome-extension/src/extension/workspace/latestNavigation";
export { processWorkbookExport } from "../../Triadichrome-extension/src/extension/workbookExportProcessing";
export { hasFileWritePermission, requestFileWritePermission } from "../../Triadichrome-extension/src/extension/filePermission";
