import type { AggregationChange } from "../domain/aggregationMaster";
import { listAccounts } from "./accountMaster";
import { listAggregations } from "./aggregations";
import { applyAggregationChange } from "./aggregationMaster";
import { prepareSave } from "./prepareSave";
import { readContents } from "./readPlan";

/** Share one private connection across master editing, undo and history preparation.
 * Validate the input, both business snapshots and the final complete file as before.
 * Aggregation edits cannot change initiatives or their derived start months.
 */
export async function prepareAggregationSave(bytes: Uint8Array, change: AggregationChange, includeDetails = true, now = new Date().toISOString()) {
  return prepareSave(bytes, now, database => {
    const master = () => JSON.stringify([listAccounts(database), listAggregations(database)]);
    const originalMaster = master();
    return () => {
      applyAggregationChange(database, change);
      return originalMaster !== master();
    };
  }, database => readContents(database, includeDetails));
}
