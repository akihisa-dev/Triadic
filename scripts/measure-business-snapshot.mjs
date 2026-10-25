// Real SQLite comparison; all data and legacy code stay in a private diagnostic bundle.
import { withNodeBundle } from "./node-bundle.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { projectRoot } from "./paths.mjs";
import os from "node:os";
const directory = await mkdtemp(join(projectRoot, "dist", ".snapshot-measure-"));
try {
  const entry = join(directory, "source.ts");
  await writeFile(entry, `export * from ${JSON.stringify(join(projectRoot, "tests/core-api.ts"))}; export { initializeSqlite } from ${JSON.stringify(join(projectRoot, "Triadic-extension/src/core/storage/sqliteRuntime.ts"))};`);
  await withNodeBundle(relative(projectRoot, entry), async api => {
    const sql = await api.initializeSqlite();
    const legacy = async source => {
      const copy = new sql.Database(source.export());
      try {
        copy.exec("DROP TABLE data_history; DROP TABLE data_history_state; VACUUM;");
        copy.run("UPDATE triadic_metadata SET value = 'snapshot' WHERE key = 'document_type'");
        return api.exportBusinessSnapshot(copy);
      } finally { copy.close(); }
    };
    const results = [];
    for (const count of [10, 100, 500]) {
      const source = await api.openTriadicDatabase(await api.createTriadicDatabase(2026));
      try {
        const account = source.exec("SELECT id FROM accounts LIMIT 1")[0].values[0][0];
        source.run("BEGIN");
        for (let i = 0; i < count; i++) {
          source.run("INSERT INTO initiatives (name,expansion_id,industry_id,department_id,sort_order) VALUES (?,1,1,1,?)", [`合成${i}`, i]);
          const id = source.exec("SELECT last_insert_rowid()")[0].values[0][0];
          source.run("INSERT INTO initiative_rows VALUES (?,?,?,0,0)", [`r${i}`, id, account]);
          for (let month = 1; month <= 12; month++) source.run("INSERT INTO initiative_amounts VALUES (?,1,?,1001,0)", [`r${i}`, month]);
        }
        source.run("COMMIT");
        const historic = await legacy(source);
        for (const histories of [0, 10, 50, 100]) {
          source.run("DELETE FROM data_history");
          for (let i = 0; i < histories; i++) source.run("INSERT INTO data_history VALUES (?,?,?)", [i+1, "2026-04-01T00:00:00.000Z", historic]);
          source.run("UPDATE data_history_state SET next_id = ?", [histories+1]);
          source.exec("VACUUM");
          const bytes = api.exportTriadicDatabase(source);
          for (const [name, operation] of [["legacy", legacy], ["business-only", api.snapshotFromDatabase]]) {
            const trials = [];
            for (let trial = 0; trial < 6; trial++) {
              globalThis.gc?.();
              const memoryBefore = process.memoryUsage();
              let copiedBytes = 0, exports = 0;
              const originalExport = source.export;
              source.export = function(schema) { const value = originalExport.call(this, schema); copiedBytes += value.length; exports++; return value; };
              const start = performance.now();
              const snapshot = await operation(source);
              const elapsed = performance.now() - start;
              source.export = originalExport;
              const memoryAfter = process.memoryUsage();
              if (trial) trials.push({ elapsed, exports, copiedBytes, snapshotBytes: snapshot.length,
                rssDelta: memoryAfter.rss-memoryBefore.rss, heapDelta: memoryAfter.heapUsed-memoryBefore.heapUsed,
                processPeakRss: process.resourceUsage().maxRSS });
              const db = await api.openBusinessSnapshot(snapshot); db.close();
            }
            results.push({ initiatives: count, rows: count, histories, inputBytes: bytes.length, name, trials });
          }
        }
      } finally { source.close(); }
    }
    console.log(JSON.stringify({ environment: { node: process.version, os: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model, sqlite: sql.version },
      scope: "検証済み接続からsnapshotまで。warmup1+5回。元計画の読込・完全検査とファイル確定は含まない。RSS/heapは呼出前後差、processPeakRssはプロセス累積最大値であり関数単体のピークではない。", results }, null, 2));
  });
} finally { await rm(directory, { recursive: true, force: true }); }
