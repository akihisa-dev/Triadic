import { PlanSession } from "../../Triadic-extension/src/extension/PlanSession";
import { type OpenPlan } from "../../Triadic-extension/src/extension/planFile";
import type { PlanCommand } from "../../Triadic-extension/src/core/domain/planCommands";
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

export * from "../../Triadic-extension/src/extension/PlanSession";
export * from "../../Triadic-extension/src/extension/triadicFile";
export * from "../../Triadic-extension/src/extension/planFile";
export * from "../../Triadic-extension/src/extension/recentFile";
export { processingTasks } from '../../Triadic-extension/src/extension/planProcessingTasks';
export { scheduleHistoryCheckpoint } from "../../Triadic-extension/src/extension/historyCheckpoint";
export * from "../../Triadic-extension/src/extension/fileConflict";
export { preparePlanCommand } from "../../Triadic-extension/src/extension/preparePlanCommand";

export { createNewPlanFile } from "../../Triadic-extension/src/extension/newPlanFile";
export { readTriadicFile } from "../../Triadic-extension/src/extension/readTriadicFile";
export { WindowSessionHub } from "../../Triadic-extension/src/extension/WindowSessionHub";
export { registerAutoSave, flushAutoSaves } from "../../Triadic-extension/src/extension/flushAutoSaves";

export { WindowPlanSession } from "../../Triadic-extension/src/extension/WindowPlanSession";

export { processPreviousWorkbook } from "../../Triadic-extension/src/extension/previousWorkbookProcessing";

export { diffPlanContents, applyPlanContentsPatch } from "../../Triadic-extension/src/core/domain/planContentsPatch";
export { bindPlanProcessing, processPlan } from "../../Triadic-extension/src/extension/planProcessing";
export { latestNavigation } from "../../Triadic-extension/src/extension/workspace/latestNavigation";
export { processWorkbookExport } from "../../Triadic-extension/src/extension/workbookExportProcessing";
export { hasFileWritePermission, requestFileWritePermission } from "../../Triadic-extension/src/extension/filePermission";

export { SpreadsheetOperation, spreadsheetWorking } from "../../Triadic-extension/src/extension/spreadsheetOperation";
