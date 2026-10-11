import assert from 'node:assert/strict';

export async function verifyReadSavedPlan(api) {
  const original = await api.createTriadicDatabase(2026);
  const changed = await api.trackHistoryChange(original, await api.saveKindSelection(original, 'cost-table', [2]));
  const checkpoint = await api.recordDataHistory(changed, new Date().toISOString(), true);
  const read = api.processingTasks.readSavedPlan;
  for (const bytes of [original, changed, checkpoint]) {
    const before = bytes.slice();
    for (const includeDetails of [true, false]) {
      assert.deepEqual(await read(bytes, includeDetails), {
        contents: await api.readPlanContents(bytes, includeDetails),
        savedHistory: await api.readDataHistory(bytes),
      }, '計画と履歴を別々に読んだ結果と一致');
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
    await assert.rejects(read(bytes), '破損・旧形式・不正値・不正参照・履歴内部用データを拒否');
    assert.deepEqual(bytes, before, '拒否したファイルを変更しない');
  }
  console.log('PASS: 共通読取の計画・履歴一致、参照専用、完全検証と不正データ拒否');
}
