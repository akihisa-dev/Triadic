import type { Database } from "./sqliteRuntime";
import { historyFromDatabase, snapshotFromDatabase, trackHistoryInDatabase } from "./dataHistory";
import { openTriadicDatabase, exportTriadicDatabase } from "./triadicDatabase";

/** One private connection owns editing, operation snapshots, history and export.
 * prepare captures the change's comparison before the business snapshot is taken.
 * Selection callers need no full contents projection.
 */
export async function prepareSave<T>(bytes: Uint8Array, now: string,
  prepare: (database: Database) => (() => boolean) | null, project: (database: Database) => T) {
  const database = await openTriadicDatabase(bytes);
  try {
    const apply = prepare(database);
    if (apply === null) return { bytes, contents: project(database), savedHistory: historyFromDatabase(database), operation: null };
    const before = await snapshotFromDatabase(database);
    database.run("BEGIN");
    const changed = apply();
    if (!changed) {
      database.run("ROLLBACK");
      return { bytes, contents: project(database), savedHistory: historyFromDatabase(database), operation: null };
    }
    database.run("UPDATE document_info SET updated_at = ? WHERE id = 1", [now]);
    database.run("COMMIT");
    const after = await snapshotFromDatabase(database);
    trackHistoryInDatabase(database, before, now);
    const savedBytes = exportTriadicDatabase(database);
    return { bytes: savedBytes, contents: project(database), savedHistory: historyFromDatabase(database), operation: after ? { before, after } : null };
  } finally { database.close(); }
}
