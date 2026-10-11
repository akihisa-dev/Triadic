import type { PlanCommand } from "../domain/planCommands";
import { applyPlanCommand } from "./planCommands";
import { prepareCommandComparison } from "./commandComparison";
import { createBusinessSnapshot, snapshotFromDatabase } from "./dataHistory";
import { exportTriadicDatabase, openTriadicDatabase } from "./triadicDatabase";
import type { editDatabase } from "./transaction";

/** The existing validated change callbacks run once on our private connection. */
export async function prepareOrdinarySave(bytes: Uint8Array, command: PlanCommand, fiscalYear: number) {
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
    const after = await snapshotFromDatabase(database);
    return { bytes: exportTriadicDatabase(database), operation: { before, after } };
  } finally { database.close(); }
}
