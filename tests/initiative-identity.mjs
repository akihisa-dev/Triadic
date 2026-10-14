import assert from 'node:assert/strict';
import { verifyReferenceRecovery } from './account-reference-rebase.mjs';

export async function verifyInitiativeIdentity(api) {
  const initial = await api.createTriadicDatabase(2026);
  const accountId = (await api.readPlanContents(initial)).accounts.find(item => item.accountType === 'sales').id;
  const draft = { name: '同じ名前', note: '', fiscalYear: '2026', expansionId: 1, industryId: 1, departmentId: 1,
    rows: [{ id: 'original-row', accountId, amounts: { 4: '0' } }] };
  const registered = await api.registerInitiative(initial, draft);
  const owner = (await api.readPlanContents(registered)).initiatives[0];
  const identity = async bytes => {
    const db = await api.openTriadicDatabase(bytes);
    try { return db.exec('SELECT identity FROM initiatives WHERE id=?', [owner.id])[0].values[0][0]; }
    finally { db.close(); }
  };
  const createdIdentity = await identity(registered);
  assert.match(createdIdentity, /^[0-9a-f]{32}$/);
  const empty = await api.updateInitiative(registered, owner.id, 2026, { ...draft, rows: [] });
  assert.equal(await identity(empty), createdIdentity, '全科目行の削除でも作成識別子を維持');
  const renamed = await api.updateInitiative(empty, owner.id, 2026, { ...draft, name: '改名確認', rows: [] });
  assert.equal(await identity(renamed), createdIdentity, '改名でも識別子を維持');
  for (const base of [registered, empty]) {
    const original = (await api.readPlanContents(base)).initiatives[0];
    const command = { type: 'initiative.update', id: owner.id, draft: { ...original, fiscalYear: '2026',
      rows: [...original.rows, { id: 'old-input', accountId, amounts: { 4: '100' } }] } };
    const local = await api.updateInitiative(base, owner.id, 2026, command.draft);
    const undo = await api.applyOperationSnapshot(base, await api.createBusinessSnapshot(initial));
    const history = await api.recordDataHistory(await api.trackHistoryChange(initial, base), new Date().toISOString(), true);
    const restore = await api.restoreDataHistory(history, (await api.readDataHistory(history)).entries.at(-1).id);
    for (const source of [undo, restore]) for (const name of ['同じ名前', '別の名前']) for (const withRow of [true, false]) {
      let replacement = await api.registerInitiative(source, { ...draft, name, rows: [{ id: 'replacement', accountId, amounts: { 4: withRow ? '200' : '0' } }] });
      if (!withRow) replacement = await api.updateInitiative(replacement, owner.id, 2026, { ...draft, name, rows: [] });
      assert.equal((await api.readPlanContents(replacement)).initiatives[0].id, owner.id);
      assert.notEqual(await identity(replacement), createdIdentity, '同番号・同内容の再登録でも新しい識別子');
      for (const [a, b] of [[local, replacement], [replacement, local]]) {
        const before = [base.slice(), a.slice(), b.slice()];
        assert.equal(await api.rebasePlan(base, a, b), null, '0行/1行の基準から別施策へ旧入力を移さない');
        assert.deepEqual([base, a, b], before);
      }
      if (name === '同じ名前' && withRow) await verifyReferenceRecovery(api, base, replacement, command);
    }
    const extra = await api.updateInitiative(base, owner.id, 2026, { ...original, fiscalYear: '2026',
      rows: [...original.rows, { id: 'safe-addition', accountId, amounts: { 5: '2' } }] });
    for (const [a, b] of [[local, extra], [extra, local]]) {
      const merged = await api.rebasePlan(base, a, b);
      assert.ok(merged?.operation, '0行からでも同じ既存施策の独立行追加を許可');
      assert.equal(await identity(merged.bytes), createdIdentity);
      assert.equal((await api.readPlanContents(merged.bytes)).initiatives[0].rows.length, original.rows.length + 2);
      const undone = await api.applyOperationSnapshot(merged.bytes, merged.operation.before);
      const redone = await api.applyOperationSnapshot(undone, merged.operation.after);
      assert.equal(await identity(undone), createdIdentity);
      assert.equal(await identity(redone), createdIdentity);
    }
  }
  const db = await api.openTriadicDatabase(registered);
  try {
    assert.throws(() => db.run('UPDATE initiatives SET identity=NULL'), /NOT NULL/);
    assert.throws(() => db.run("UPDATE initiatives SET identity='不正'"), /CHECK/);
    db.run("INSERT INTO initiatives(name,expansion_id,industry_id,department_id,sort_order) VALUES('一意性確認',1,1,1,1)");
    assert.throws(() => db.run('UPDATE initiatives SET identity=? WHERE id!=?', [createdIdentity, owner.id]), /UNIQUE/);
    db.run('PRAGMA ignore_check_constraints=ON');
    db.run("UPDATE initiatives SET identity='invalid' WHERE id=?", [owner.id]);
    const invalid = db.export(), before = invalid.slice();
    await assert.rejects(api.readPlanContents(invalid));
    assert.deepEqual(invalid, before, '不正な識別子を補完せず元ファイルを保持');
  } finally { db.close(); }
  console.log('PASS: 施策の必須・一意作成識別子、0/1行基準の取消/履歴復元・同名/異名・再作成行あり/なし・両方向拒否、独立行追加と回復・取消保持');
}
