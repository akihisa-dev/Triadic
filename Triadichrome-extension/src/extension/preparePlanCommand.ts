import type { PlanCommand } from "../core/domain/planCommands";
import type { PlanContents } from "../core/domain/plan";
import { applyPlanCommand, createBusinessSnapshot, readPlanContents, prepareAggregationSave, prepareKindSelectionSave } from "./planProcessing";
import { planContents, type OpenPlan, type PreparedPlanChange } from "./planFile";
export type SavedOperation = { before: Uint8Array; after: Uint8Array };
type CommandPreparation = ({ kind: "prepared"; prepared: PreparedPlanChange } | { kind: "ordinary"; bytes: Uint8Array }) & { operation: SavedOperation | null };
function operationContents(contents: PlanContents): string {
  // Conflict counters describe write sequencing, not a user-visible change.
  return JSON.stringify(contents, (key, value: unknown) =>
    ["details", "revision", "initiativeRevision", "rowRevision", "amountRevisions", "overrideRevisions"].includes(key) ? undefined : value);
}
/** Data preparation never selects a destination or publishes a saved document. */
export async function preparePlanCommand(target: OpenPlan, command: PlanCommand): Promise<CommandPreparation> {
  if (command.type === "settings" && command.change.type === "selection") {
    const { screen, selected } = command.change;
    const prepared = await prepareKindSelectionSave(target.bytes, screen, selected);
    const operation = prepared.operation;
    // These references remain valid: only kind_selections and timestamps changed.
    const contents = { ...planContents(target), kindSelections: { ...target.kindSelections, [screen]: [...selected] } };
    return { kind: "prepared", prepared: { ...prepared, contents }, operation };
  }
  if (command.type === "aggregation") {
    const prepared = await prepareAggregationSave(target.bytes, command.change);
    const operation = prepared.operation;
    return { kind: "prepared", prepared, operation };
  }
  let operation: SavedOperation | null = null;
  const bytes = await applyPlanCommand(target.bytes, command, target.fiscalYear);
  if (operationContents(planContents(target)) !== operationContents(await readPlanContents(bytes))) {
    operation = { before: await createBusinessSnapshot(target.bytes), after: await createBusinessSnapshot(bytes) };
  }
  return { kind: "ordinary", bytes, operation };
}
