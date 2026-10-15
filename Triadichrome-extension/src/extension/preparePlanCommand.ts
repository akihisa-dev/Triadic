import type { PlanCommand } from "../core/domain/planCommands";
import { prepareOrdinarySave, prepareAggregationSave, prepareKindSelectionSave } from "./planProcessing";
import { planContents, type OpenPlan, type PreparedPlanChange } from "./planFile";
export type SavedOperation = { before: Uint8Array; after: Uint8Array };
type CommandPreparation = { operation: null } | { prepared: PreparedPlanChange; operation: SavedOperation };
/** Data preparation never selects a destination or publishes a saved document. */
export async function preparePlanCommand(target: OpenPlan, command: PlanCommand): Promise<CommandPreparation> {
  if (command.type === "settings" && command.change.type === "selection") {
    const { screen, selected } = command.change;
    const prepared = await prepareKindSelectionSave(target.bytes, screen, selected);
    const operation = prepared.operation;
    if (!operation) return { operation: null };
    // These references remain valid: only kind_selections and timestamps changed.
    const contents = { ...planContents(target), kindSelections: { ...target.kindSelections, [screen]: [...selected] } };
    return { prepared: { ...prepared, contents }, operation };
  }
  if (command.type === "aggregation") {
    const prepared = await prepareAggregationSave(target.bytes, command.change);
    const operation = prepared.operation;
    return operation ? { prepared, operation } : { operation: null };
  }
  const prepared = await prepareOrdinarySave(target.bytes, command, target.fiscalYear);
  return prepared.operation ? { prepared, operation: prepared.operation } : { operation: null };
}
