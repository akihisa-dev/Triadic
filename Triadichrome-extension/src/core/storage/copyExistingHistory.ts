import type { Database } from "./sqliteRuntime";

/** Copy surviving checkpoints between validated private DBs; state belongs to the caller. */
export function copyExistingHistory(source: Database, target: Database): void {
  let lastId = 0;
  for (;;) {
    const row = source.exec("SELECT id, recorded_at, snapshot FROM data_history WHERE id > ? ORDER BY id LIMIT 1", [lastId])[0]?.values[0];
    if (!row) break;
    target.run("INSERT INTO data_history VALUES (?, ?, ?)", row);
    lastId = Number(row[0]);
  }
}
