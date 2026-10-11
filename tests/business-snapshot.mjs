import assert from "node:assert/strict";

export async function verifyBusinessSnapshot(api) {
  const bytes = await api.createSamplePlan();
  const source = await api.openTriadicDatabase(bytes);
  try {
    // Include deleted maxima, which must survive restore even when no live row has this ID.
    source.run("UPDATE sqlite_sequence SET seq = seq + 1000");
    const originalExport = source.export;
    source.export = schema => { if (!schema) throw new Error("履歴込み全体コピーは禁止"); return originalExport.call(source, schema); };
    const snapshot = await api.snapshotFromDatabase(source);
    const copy = await api.openBusinessSnapshot(snapshot);
    try {
      for (const table of [...api.BUSINESS_TABLES, "sqlite_sequence"]) {
        const rows = db => db.exec(`SELECT * FROM ${table}`)[0]?.values ?? [];
        const expected = rows(source).map(row => table === "triadic_metadata" && row[0] === "document_type" ? ["document_type", "snapshot"] : row);
        assert.deepEqual(rows(copy), expected, `${table}: NULL・金額・参照・改訂・順序・採番を保持`);
      }
      assert.equal(copy.exec("SELECT name FROM sqlite_master WHERE name LIKE 'data_history%'").length, 0);
      const previous = Number(copy.exec("SELECT seq FROM sqlite_sequence WHERE name = 'initiatives'")[0].values[0][0]);
      copy.run("INSERT INTO initiatives (name,expansion_id,industry_id,department_id,sort_order) VALUES ('復元後の追加',1,1,1,999)");
      assert.equal(copy.exec("SELECT last_insert_rowid()")[0].values[0][0], previous + 1);
    } finally { copy.close(); }
    source.export = originalExport;
    const preserved = source.export();
    const originalRun = source.run;
    source.run = function(sql, params) { if (sql.startsWith("INSERT INTO business_snapshot.initiative_rows")) throw new Error("転記失敗"); return originalRun.call(this, sql, params); };
    await assert.rejects(api.snapshotFromDatabase(source), /転記失敗/);
    source.run = originalRun;
    assert.equal(source.exec("PRAGMA database_list")[0].values.filter(row => row[1] === "business_snapshot").length, 0, "失敗時も作業領域を解放");
    assert.deepEqual(source.export(), preserved, "失敗しても元接続と履歴を変更しない");
    await api.openTriadicDatabase(preserved).then(db => db.close());
  } finally { source.close(); }
  console.log("PASS: 業務限定コピー、全項目・採番状態一致、入れ子防止、転記失敗時の元データ保護");
}
