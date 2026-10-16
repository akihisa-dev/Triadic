import type { Database } from "./sqliteRuntime";
import { exportTriadicDatabase, openTriadicDatabase, openBusinessSnapshot, businessSchemaDefinitions } from "./triadicDatabase";
import { DATA_HISTORY_SQL, isHistoryTimestamp } from "./dataHistorySchema";
import { BUSINESS_TABLES, TRIADIC_FORMAT_VERSION } from "./triadicSchema";

import { HISTORY_INTERVAL_MS, type DataHistoryStatus, type HistoryDeletion } from "../domain/dataHistory";

function timestamp(now: string): string {
  if (!isHistoryTimestamp(now)) throw new Error("履歴の日時が正しくありません。");
  return now;
}

function state(database: Database) {
  const row = database.exec("SELECT next_id, dirty_since, saved_at FROM data_history_state WHERE id = 1")[0]!.values[0]!;
  return { nextId: Number(row[0]), dirtySince: row[1] === null ? null : String(row[1]), savedAt: String(row[2]) };
}

export async function createBusinessSnapshot(bytes: Uint8Array): Promise<Uint8Array> {
  const database = await openTriadicDatabase(bytes);
  try {
    return await snapshotFromDatabase(database);
  } finally { database.close(); }
}

/** Copy only canonical business rows from a validated private connection, including allocation high-water marks. */
export async function snapshotFromDatabase(database: Database): Promise<Uint8Array> {
  // A private attached memory DB allows INSERT SELECT without transferring rows or history BLOBs through JS.
  database.run("ATTACH DATABASE ':memory:' AS business_snapshot");
  try {
    for (const definition of businessSchemaDefinitions()) database.run(definition.replace(/^(CREATE (?:TABLE|INDEX|TRIGGER) )/, "$1business_snapshot."));
    database.run(`PRAGMA business_snapshot.user_version = ${TRIADIC_FORMAT_VERSION}`);
    database.run("PRAGMA defer_foreign_keys = ON");
    // Schema order is canonical, but references may point forward; enforce all references in the completed snapshot.
    database.run("BEGIN");
    try {
      for (const table of BUSINESS_TABLES) database.run(`INSERT INTO business_snapshot.${table} SELECT * FROM main.${table}`);
      database.run("DELETE FROM business_snapshot.sqlite_sequence");
      database.run("INSERT INTO business_snapshot.sqlite_sequence SELECT * FROM main.sqlite_sequence");
      database.run("UPDATE business_snapshot.triadic_metadata SET value = 'snapshot' WHERE key = 'document_type'");
      database.run("COMMIT");
    } catch (error) { database.run("ROLLBACK"); throw error; }
    const bytes = database.export("business_snapshot");
    const checked = await openBusinessSnapshot(bytes);
    checked.close();
    return bytes;
  } finally { database.run("DETACH DATABASE business_snapshot"); }
}

function initialize(database: Database, now: string): void {
  database.run("UPDATE triadic_metadata SET value = 'plan' WHERE key = 'document_type'");
  database.exec(DATA_HISTORY_SQL);
  database.run("INSERT INTO data_history_state VALUES (1, 1, 1, NULL, ?)", [timestamp(now)]);
}

function append(database: Database, snapshot: Uint8Array, now: string): void {
  const { nextId } = state(database);
  if (!Number.isSafeInteger(nextId + 1)) throw new Error("これ以上履歴を記録できません。");
  database.run("INSERT INTO data_history (id, recorded_at, snapshot) VALUES (?, ?, ?)", [nextId, timestamp(now), snapshot]);
  database.run("UPDATE data_history_state SET next_id = ? WHERE id = 1", [nextId + 1]);
}

export async function readDataHistory(bytes: Uint8Array): Promise<DataHistoryStatus> {
  const database = await openTriadicDatabase(bytes);
  try {
    return historyFromDatabase(database);
  } finally { database.close(); }
}
export function historyFromDatabase(database: Database): DataHistoryStatus {
  return {
    entries: (database.exec("SELECT id, recorded_at FROM data_history ORDER BY id DESC")[0]?.values ?? [])
      .map(([id, at]) => ({ id: Number(id), recordedAt: String(at) })),
    dirtySince: state(database).dirtySince,
  };
}
/** The snapshot was generated and validated from the unmodified private connection. */
export function trackHistoryInDatabase(database: Database, original: Uint8Array, now: string): void {
  timestamp(now);
  if (state(database).nextId === 1) append(database, original, now);
  database.run("UPDATE data_history_state SET dirty_since = COALESCE(dirty_since, ?), saved_at = ? WHERE id = 1", [now, now]);
}

/** Called on the copy before writing; the first successful change also preserves its original. */
export async function trackHistoryChange(before: Uint8Array, after: Uint8Array, now = new Date().toISOString()): Promise<Uint8Array> {
  timestamp(now);
  const database = await openTriadicDatabase(after);
  try {
    if (state(database).nextId === 1) {
      append(database, await createBusinessSnapshot(before), now);
    }
    database.run("UPDATE data_history_state SET dirty_since = COALESCE(dirty_since, ?), saved_at = ? WHERE id = 1", [now, now]);
    return exportTriadicDatabase(database);
  } finally { database.close(); }
}

/** Force checkpoints for closing/preview/restore; otherwise preserve the five-minute deadline. */
export async function recordDataHistory(bytes: Uint8Array, now = new Date().toISOString(), force = false): Promise<Uint8Array> {
  timestamp(now);
  const database = await openTriadicDatabase(bytes);
  try {
    const { dirtySince } = state(database);
    if (dirtySince === null || (!force && Date.parse(now) - Date.parse(dirtySince) < HISTORY_INTERVAL_MS)) return bytes;
    append(database, await snapshotFromDatabase(database), now);
    database.run("UPDATE data_history_state SET dirty_since = NULL WHERE id = 1");
    return exportTriadicDatabase(database);
  } finally { database.close(); }
}

export async function readHistorySnapshot(bytes: Uint8Array, id: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("履歴を選択してください。");
  const database = await openTriadicDatabase(bytes);
  try {
    const snapshot = database.exec("SELECT snapshot FROM data_history WHERE id = ?", [id])[0]?.values[0]?.[0];
    if (!(snapshot instanceof Uint8Array)) throw new Error("指定した履歴が見つかりません。");
    const copy = Uint8Array.from(snapshot);
    const historic = await openBusinessSnapshot(copy);
    try {
      const fiscalYear = (db: Database) => db.exec("SELECT fiscal_year FROM document_info WHERE id = 1")[0]?.values[0]?.[0];
      if (fiscalYear(historic) !== fiscalYear(database)) throw new Error("履歴の基準年度が一致しません。");
    } finally { historic.close(); }
    return copy;
  } finally { database.close(); }
}

export async function restoreDataHistory(bytes: Uint8Array, id: number, now = new Date().toISOString()): Promise<Uint8Array> {
  timestamp(now);
  const selected = await readHistorySnapshot(bytes, id);
  const restored = await openBusinessSnapshot(selected);
  let current: Database | undefined;
  try {
    current = await openTriadicDatabase(bytes);
    // Preserve all surviving history, independently of the business state being restored.
    initialize(restored, now);
    // Read one BLOB at a time using the primary key, without retaining all history payloads in JS.
    let lastId = 0;
    for (;;) {
      const entry = current.exec("SELECT id, recorded_at, snapshot FROM data_history WHERE id > ? ORDER BY id LIMIT 1", [lastId])[0]?.values[0];
      if (!entry) break;
      const [entryId, recordedAt, snapshot] = entry;
      restored.run("INSERT INTO data_history VALUES (?, ?, ?)", [Number(entryId), String(recordedAt), snapshot as Uint8Array]);
      lastId = Number(entryId);
    }
    restored.run("UPDATE data_history_state SET next_id = ? WHERE id = 1", [state(current).nextId]);
    append(restored, await snapshotFromDatabase(current), now);
    append(restored, selected, now);
    return exportTriadicDatabase(restored);
  } finally { current?.close(); restored.close(); }
}

export async function deleteDataHistory(bytes: Uint8Array, deletion: HistoryDeletion): Promise<Uint8Array> {
  if ("before" in deletion) timestamp(deletion.before);
  else if (!deletion.ids.length || deletion.ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error("削除する履歴を選択してください。");
  const database = await openTriadicDatabase(bytes);
  try {
    database.exec("BEGIN");
    try {
      if ("before" in deletion) database.run("DELETE FROM data_history WHERE recorded_at < ?", [deletion.before]);
      else for (const id of new Set(deletion.ids)) {
        database.run("DELETE FROM data_history WHERE id = ?", [id]);
        if (!database.getRowsModified()) throw new Error("削除する履歴が見つかりません。");
      }
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    database.exec("VACUUM");
    return exportTriadicDatabase(database);
  } finally { database.close(); }
}
