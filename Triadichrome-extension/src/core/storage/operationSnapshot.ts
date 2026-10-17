import { DATA_HISTORY_SQL } from "./dataHistorySchema";
import { exportTriadicDatabase, openBusinessSnapshot, openTriadicDatabase } from "./triadicDatabase";

/** Replace business data while retaining the current checkpoints and their recording deadline. */
export async function applyOperationSnapshot(bytes: Uint8Array, snapshot: Uint8Array): Promise<Uint8Array> {
  const current = await openTriadicDatabase(bytes);
  try {
    const restored = await openBusinessSnapshot(snapshot);
    try {
      const year = (database: typeof current) => database.exec("SELECT fiscal_year FROM document_info WHERE id = 1")[0]!.values[0]![0];
      if (year(current) !== year(restored)) throw new Error("操作履歴の基準年度が一致しません。");
      restored.run("UPDATE triadic_metadata SET value = 'plan' WHERE key = 'document_type'");
      restored.exec(DATA_HISTORY_SQL);
      let lastId = 0;
      for (;;) {
        const row = current.exec("SELECT id, recorded_at, snapshot FROM data_history WHERE id > ? ORDER BY id LIMIT 1", [lastId])[0]?.values[0];
        if (!row) break;
        restored.run("INSERT INTO data_history VALUES (?, ?, ?)", row);
        lastId = Number(row[0]);
      }
      const state = current.exec("SELECT id, version, next_id, dirty_since, saved_at FROM data_history_state")[0]!.values[0]!;
      restored.run("INSERT INTO data_history_state VALUES (?, ?, ?, ?, ?)", state);
      return exportTriadicDatabase(restored);
    } finally { restored.close(); }
  } finally { current.close(); }
}
