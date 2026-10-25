import assert from 'node:assert/strict';

export async function verifyReadSavedPlan(api) {
  const original = await api.createTriadicDatabase(2026);
  const changed = await api.trackHistoryChange(original, await api.saveKindSelection(original, 'cost-table', [2]));
  const checkpoint = await api.recordDataHistory(changed, new Date().toISOString(), true);
  const read = api.processingTasks.readSavedPlan;
  const { Database } = await api.initializeSqlite();
  const exec = Database.prototype.exec;
  let checks = 0;
  Database.prototype.exec = function(sql, ...args) {
    if (sql === 'PRAGMA integrity_check') checks++;
    return exec.call(this, sql, ...args);
  };
  const session = new api.PlanSession();
  try {
    for (const bytes of [original, changed, checkpoint]) {
      const expected = await read(bytes);
      checks = 0;
      await session.open({ name: '確認.triadic', bytes });
      assert.equal(checks, 1, '開く際の完全検査は一回');
      assert.deepEqual(session.getSnapshot().contents, expected.contents);
      assert.deepEqual(session.getSnapshot().history, expected.savedHistory);
      checks = 0;
      await api.readPlanContents(bytes);
      await api.readDataHistory(bytes);
      assert.equal(checks, 2, '以前の分割読込は二回');
    }
  } finally { Database.prototype.exec = exec; }
  for (const bytes of [original, changed, checkpoint]) {
    const before = bytes.slice();
    {
      assert.deepEqual(await read(bytes), {
        contents: await api.readPlanContents(bytes),
        savedHistory: await api.readDataHistory(bytes),
      }, 'データと履歴を別々に読んだ結果と一致');
    }
    assert.deepEqual(bytes, before, '読み取りで元ファイルを変更しない');
  }
  const invalid = [new Uint8Array([1, 2, 3]), original.slice(0, 128), await api.createBusinessSnapshot(original)];
  for (const sql of [
    'PRAGMA user_version = 24',
    "CREATE VIEW unexpected_view AS SELECT id FROM accounts",
    'PRAGMA foreign_keys = OFF; INSERT INTO previous_amounts (account_id,industry_id,department_id,month,amount_yen) VALUES (999999,1,1,4,1)',
    'PRAGMA ignore_check_constraints = ON; INSERT INTO previous_amounts (account_id,industry_id,department_id,month,amount_yen) VALUES (1,1,1,13,1)',
    "UPDATE data_history_state SET dirty_since = '不正な日時'",
  ]) {
    const db = await api.openTriadicDatabase(original);
    try { db.exec(sql); invalid.push(db.export()); } finally { db.close(); }
  }
  for (const bytes of invalid) {
    const before = bytes.slice();
    const snapshot = session.getSnapshot();
    await assert.rejects(session.open({ name: '不正.triadic', bytes }));
    assert.strictEqual(session.getSnapshot(), snapshot, '失敗しても元のセッションを公開したまま保持');
    await assert.rejects(read(bytes), '破損・旧形式・不正値・不正参照・履歴内部用データを拒否');
    assert.deepEqual(bytes, before, '拒否したファイルを変更しない');
  }
  console.log('PASS: 共通読取のデータ・履歴一致、参照専用、完全検証と不正データ拒否');
}
