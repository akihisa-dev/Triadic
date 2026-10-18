import type { PlanCommand } from "../domain/planCommands";
import { applyPlanCommand } from "./planCommands";
import { prepareCommandComparison } from "./commandComparison";
import { createBusinessSnapshot } from "./dataHistory";
import { openTriadicDatabase } from "./triadicDatabase";
import { finishPreparedSave } from "./prepareSave";
import { readContents } from "./readPlan";
import type { editDatabase } from "./transaction";
type OrdinaryPreparation = { bytes: Uint8Array; operation: null }
  | Awaited<ReturnType<typeof finishPreparedSave<ReturnType<typeof readContents>>>>;

/** The existing validated change callbacks run once on our private connection. */
export async function prepareOrdinarySave(bytes: Uint8Array, command: PlanCommand, fiscalYear: number): Promise<OrdinaryPreparation> {
  const database = await openTriadicDatabase(bytes);
  try {
    const comparison = prepareCommandComparison(database, command);
    let changed: boolean;
    database.run("BEGIN");
    try {
      const edit: typeof editDatabase = async (_bytes, change) => ({ bytes, result: change(database) });
      await applyPlanCommand(bytes, command, fiscalYear, edit);
      changed = comparison.changed();
      if (changed) database.run("UPDATE document_info SET updated_at = ? WHERE id = 1", [new Date().toISOString()]);
      database.run(changed ? "COMMIT" : "ROLLBACK");
    } catch (error) { database.run("ROLLBACK"); throw error; }
    finally { comparison.close(); }
    if (!changed) return { bytes, operation: null };
    // Before comes from untouched input; never snapshot the modified connection as the original.
    const before = await createBusinessSnapshot(bytes);
    return await finishPreparedSave(database, before, new Date().toISOString(), readContents);
  } finally { database.close(); }
}
