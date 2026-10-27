import { rebasePlan } from "../core/storage/rebasePlan";
import { compareSavedHistory } from "../core/storage/historyDifference";
import * as history from "../core/storage/dataHistory";
import { applyOperationSnapshot } from "../core/storage/operationSnapshot";
import { readPlanContents, readSnapshotContents } from "../core/storage/readPlan";
import { readSavedPlan } from "../core/storage/readSavedPlan";
import { createTriadicDatabase } from "../core/storage/triadicDatabase";
import { applyPlanCommand } from "../core/storage/planCommands";
import { prepareAggregationSave } from "../core/storage/prepareAggregationSave";
import { prepareKindSelectionSave, prepareComparisonSelectionSave } from "../core/storage/prepareKindSelectionSave";
import { prepareOrdinarySave } from "../core/storage/prepareOrdinarySave";
export const processingTasks = {
  compareSavedHistory,
  rebasePlan,
  prepareKindSelectionSave,
  prepareComparisonSelectionSave,
  prepareAggregationSave,
  prepareOrdinarySave,
  bytesEqual: async (current: Uint8Array, expected: Uint8Array) => {
    if (current.length !== expected.length) return false;
    for (let index = 0; index < current.length; index++) if (current[index] !== expected[index]) return false;
    return true;
  },
  createTriadicDatabase,
  readPlanContents,
  readSavedPlan,
  readSnapshotContents,
  applyPlanCommand,
  applyOperationSnapshot,
  createBusinessSnapshot: history.createBusinessSnapshot,
  readDataHistory: history.readDataHistory,
  readHistorySnapshot: history.readHistorySnapshot,
  trackHistoryChange: history.trackHistoryChange,
  recordDataHistory: history.recordDataHistory,
  restoreDataHistory: history.restoreDataHistory,
  deleteDataHistory: history.deleteDataHistory,
};
