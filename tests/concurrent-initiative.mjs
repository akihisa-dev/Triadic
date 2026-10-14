import assert from 'node:assert/strict';
import { verifyReferenceRecovery } from './account-reference-rebase.mjs';

export async function verifyConcurrentInitiative(api) {
  const { base, local, external, localDraft, externalDraft } = await api.createConcurrentInitiativeFixture();
  for (const [a, b, draft] of [[local, external, localDraft], [external, local, externalDraft]]) {
    const before = [base.slice(), a.slice(), b.slice()];
    assert.equal(await api.rebasePlan(base, a, b), null, '同名の独立登録を両保存順で拒否する');
    assert.deepEqual([base, a, b], before, '拒否時は両側の金額と元ファイルを保持する');
    await verifyReferenceRecovery(api, base, b, { type: 'initiative.register', draft });
    await assert.rejects(api.registerInitiative(b, draft), /同じ施策名/, '通常の逐次登録でも重複を拒否する');
  }
  const identical = await api.registerInitiative(base, { ...externalDraft, rows: [{ ...externalDraft.rows[0], amounts: { 4: '100' } }] });
  assert.equal(await api.rebasePlan(base, local, identical), null, '金額まで一致しても独立登録を同一施策と扱わない');
  const otherName = await api.registerInitiative(base, { ...externalDraft, name: '別の新規施策' });
  assert.equal(await api.rebasePlan(base, local, otherName), null, '異名の新規番号衝突も拒否する');
  const existing = (await api.readPlanContents(local)).initiatives[0];
  const append = (id, amount) => api.updateInitiative(local, existing.id, 2026, { ...existing, fiscalYear: '2026',
    rows: [...existing.rows, { id, accountId: existing.rows[0].accountId, amounts: { 5: amount } }] });
  const left = await append('left-addition', '1'), right = await append('right-addition', '2');
  for (const [a, b] of [[left, right], [right, left]]) {
    const merged = await api.rebasePlan(local, a, b);
    assert.ok(merged?.operation, '共通基準にある同一施策への独立行追加は統合する');
    assert.equal((await api.readPlanContents(merged.bytes)).initiatives[0].rows.length, 3);
    const undone = await api.applyOperationSnapshot(merged.bytes, merged.operation.before);
    const redone = await api.applyOperationSnapshot(undone, merged.operation.after);
    assert.equal((await api.readPlanContents(undone)).initiatives[0].rows.length, 2);
    assert.equal((await api.readPlanContents(redone)).initiatives[0].rows.length, 3);
  }
  console.log('PASS: 同名施策の同時新規登録を両順で拒否、逐次重複・同額・異名、競合回復と入力保護、既存施策の独立行追加と取消やり直し');
}
