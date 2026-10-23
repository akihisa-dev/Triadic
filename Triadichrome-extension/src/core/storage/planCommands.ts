import type { Database } from "./sqliteRuntime";
import { editDatabase } from "./transaction";
import { applyExpansionCategoryChange } from "./expansionCategoryMaster";
import type { PlanCommand } from "../domain/planCommands";
import { applyAccountChange } from "./accountMaster";
import { applyAggregationChange } from "./aggregationMaster";
import { applyExpansionChange } from "./expansionMaster";
import { applyIndustryChange } from "./industryMaster";
import { applyDepartmentChange } from "./departmentMaster";
import { applyPeriodChange } from "./periodMaster";
import { applyInitiativeRegistration, applyInitiativeUpdate } from "./initiatives";
import { applyPlanSettings } from "./settings";
export async function applyPlanCommand(bytes: Uint8Array, command: PlanCommand, fiscalYear: number): Promise<Uint8Array> {
  return (await editDatabase(bytes, database => applyPlanCommandToDatabase(database, command, fiscalYear))).bytes;
}

/** The caller owns validation of the connection, its transaction, export and lifetime. */
export function applyPlanCommandToDatabase(database: Database, command: PlanCommand, fiscalYear: number): void {
  switch (command.type) {
    case "account": applyAccountChange(database, command.change); return;
    case "aggregation": return applyAggregationChange(database, command.change);
    case "expansion-category": return applyExpansionCategoryChange(database, command.change);
    case "expansion": return applyExpansionChange(database, command.change);
    case "industry": return applyIndustryChange(database, command.change);
    case "department": return applyDepartmentChange(database, command.change);
    case "period": return applyPeriodChange(database, command.change);
    case "settings": return applyPlanSettings(database, command.change);
    case "initiative.register": return applyInitiativeRegistration(database, command.draft);
    case "initiative.update": return applyInitiativeUpdate(database, command.id, fiscalYear, command.draft);
  }
}
