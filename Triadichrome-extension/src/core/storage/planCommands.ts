import { changeDetailDocument } from "./detailDocuments";
import { editDatabase } from "./transaction";
import { changeExpansionCategoryMaster } from "./expansionCategoryMaster";
import type { PlanCommand } from "../domain/planCommands";
import { changeAccountMaster } from "./accountMaster";
import { changeAggregationMaster } from "./aggregationMaster";
import { changeExpansionMaster } from "./expansionMaster";
import { changeIndustryMaster } from "./industryMaster";
import { changeDepartmentMaster } from "./departmentMaster";
import { changePeriodMaster } from "./periodMaster";
import { registerInitiative, updateInitiative } from "./initiatives";
import { changePlanSettings } from "./settings";
export async function applyPlanCommand(bytes: Uint8Array, command: PlanCommand, fiscalYear: number, edit = editDatabase): Promise<Uint8Array> {
  switch (command.type) {
    case "detail": return changeDetailDocument(bytes, command.change, edit);
    case "account": return (await changeAccountMaster(bytes, command.change, edit)).bytes;
    case "aggregation": return changeAggregationMaster(bytes, command.change);
    case "expansion-category": return changeExpansionCategoryMaster(bytes, command.change, edit);
    case "expansion": return changeExpansionMaster(bytes, command.change, edit);
    case "industry": return changeIndustryMaster(bytes, command.change, edit);
    case "department": return changeDepartmentMaster(bytes, command.change, edit);
    case "period": return changePeriodMaster(bytes, command.change, edit);
    case "settings": return changePlanSettings(bytes, command.change, edit);
    case "initiative.register": return registerInitiative(bytes, command.draft, edit);
    case "initiative.update": return updateInitiative(bytes, command.id, fiscalYear, command.draft, edit);
  }
}
