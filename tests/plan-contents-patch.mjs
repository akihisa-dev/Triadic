import assert from 'node:assert/strict';
export function verifyPlanContentsPatch(api, seed) {
  const before = { ...seed, previousKind: 2 };
  const after = structuredClone(before);
  delete after.previousKind;
  after.departments[0].departmentName += '変更';
  after.industries.push({ ...after.industries[0], id: 999, industryName: '追加' });
  const patch = api.diffPlanContents(before, after);
  assert.ok(patch);
  const applied = api.applyPlanContentsPatch(before, structuredClone(patch));
  assert.deepEqual(applied, after);
  assert.equal(applied.accounts, before.accounts, '変わらない計算元の参照を保持');
  assert.equal(before.previousKind, 2, '元の状態を変更しない');
  assert.deepEqual(api.diffPlanContents(before, structuredClone(before)), []);
  for (const count of [1, 100000]) {
    const base = { ...seed, previousAmounts: Array.from({ length: count }, (_, index) => ({ id: index + 1, accountId: 1, industryId: 1, departmentId: 1, previousKind: 1, month: 4, revision: 0, amount: '1' })) };
    const next = structuredClone(base); next.previousAmounts[count - 1].amount = '1.001'; next.previousAmounts[count - 1].revision++;
    const start = performance.now(), delta = api.diffPlanContents(base, next), elapsedMs = performance.now() - start;
    assert.ok(delta); assert.equal(delta.length, 2);
    const bytes = Buffer.byteLength(JSON.stringify(delta)), completeBytes = Buffer.byteLength(JSON.stringify(next));
    assert.ok(bytes < completeBytes);
    for (const windows of [1, 5, 10]) {
      for (let i = 0; i < windows; i++) {
        const state = api.applyPlanContentsPatch(base, structuredClone(delta));
        assert.equal(state.previousAmounts[count - 1].amount, '1.001');
        assert.equal(state.previousAmounts.length, count);
        if (count > 1) assert.equal(state.previousAmounts[0], base.previousAmounts[0]);
        assert.equal(state.accounts, base.accounts);
      }
      console.log(`ウィンドウ差分: ${count}行・${windows}画面、${completeBytes * windows} → ${bytes * windows} bytes、差分準備${elapsedMs.toFixed(2)}ms`);
    }
    const broad = structuredClone(base);
    for (let i = 0; i < Math.min(1001, count); i++) broad.previousAmounts[i].amount = '2';
    if (count > 1000) assert.equal(api.diffPlanContents(base, broad), null, '多数の変更は全体同期へ戻す');
    assert.equal(base.previousAmounts[count - 1].amount, '1');
  }
}
