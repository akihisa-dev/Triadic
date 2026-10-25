import assert from 'node:assert/strict';

export async function verifyAutoSaveSource(api) {
  const fixture = await api.createReplacedEmptyInitiativeFixture();
  const before = await api.readPlanContents(fixture.base), after = await api.readPlanContents(fixture.external);
  const old = before.initiatives[0], replacement = after.initiatives[0];
  assert.equal(old.id, replacement.id);
  assert.notEqual(old.identity, replacement.identity);
  assert.equal(old.rows.length + replacement.rows.length, 0);
  const draftOf = item => ({ name: item.name, note: item.note, fiscalYear: '2026', expansionId: item.expansionId,
    departmentId: item.departmentId, industryId: item.industryId, rows: item.rows });
  let stored = fixture.external, writes = 0;
  const handle = { name: '編集対象の保護.triadic', async getFile() { return new File([stored], this.name); },
    async createWritable() { let pending; return { async write(value) { pending = new Uint8Array(value).slice(); },
      async close() { stored = pending; writes++; }, async abort() {} }; } };
  const session = new api.PlanSession(); await session.open({ ...before, bytes: fixture.base, name: handle.name, handle });
  const controller = new api.AutoSave(async draft => { await session.dispatch({ type: 'initiative.update', id: old.id, draft }, async () => handle); }, 100000);
  controller.begin(draftOf(old), old.identity);
  controller.change({ ...draftOf(old), name: '', note: '保護する旧入力' }); await controller.flush();
  assert.equal(controller.getSnapshot().pending, true);
  // An unrelated save publishes the externally replaced initiative through the real storage session.
  const published = await session.dispatch({ type: 'settings', change: { type: 'selection', screen: 'cost-table', selected: [2] } }, async () => handle);
  controller.syncSaved(draftOf(published.initiatives[0]), published.initiatives[0].identity);
  assert.equal(controller.hasSourceChange(), true);
  const count = writes;
  controller.change({ ...controller.getSnapshot().draft, name: '引き継ぐ施策' }); await controller.flush();
  assert.equal(writes, count, '名前を直しても新しい所有者に旧入力を保存しない');
  assert.equal((await api.readPlanContents(stored)).initiatives[0].note, '置換先の備考');
  const accountId = before.accounts[0].id;
  const input = { ...controller.getSnapshot().draft, rows: [{ id: 'old-row', revision: 8, amountRevisions: { 4: 3 }, overrideRevisions: { 2: { 4: 4 } }, accountId, amounts: { 4: '1.001' }, overrides: { 2: { 4: '0' } } }] };
  const recovered = api.recoverInitiativeDraft(input, before, published);
  assert.equal(recovered.note, input.note); assert.equal(recovered.rows[0].overrides[2][4], '0');
  assert.notEqual(recovered.rows[0].id, 'old-row');
  for (const key of ['revision', 'amountRevisions', 'overrideRevisions']) assert.equal(key in recovered.rows[0], false);
  await session.dispatch({ type: 'initiative.register', draft: recovered }, async () => handle);
  const saved = await api.readPlanContents(stored);
  assert.deepEqual(saved.initiatives[0], published.initiatives[0], '引き継ぎの登録は置換先を変更しない');
  assert.equal(saved.initiatives[1].note, '保護する旧入力');
  assert.notEqual(saved.initiatives[1].identity, replacement.identity);
  await session.travelOperation(-1, async () => handle); assert.equal(session.getSnapshot().contents.initiatives.length, 1);
  await session.travelOperation(1, async () => handle); assert.equal(session.getSnapshot().contents.initiatives[1].note, '保護する旧入力');
  const changedReferences = structuredClone(published);
  changedReferences.departments.find(item => item.id === input.departmentId).identity = 'new-department';
  changedReferences.accounts.find(item => item.id === accountId).accountName = '別の科目';
  const reselected = api.recoverInitiativeDraft(input, before, changedReferences);
  assert.equal(reselected.departmentId, null); assert.equal(reselected.industryId, null); assert.equal(reselected.rows[0].accountId, null);
  assert.deepEqual(reselected.rows[0].amounts, input.rows[0].amounts);
  controller.discard(); assert.equal(controller.getSnapshot().draft.note, '置換先の備考'); assert.equal(controller.getSnapshot().pending, false); controller.end();

  for (const fail of [false, true]) {
    let finish;
    const delayed = new api.AutoSave(async () => { await new Promise(resolve => { finish = resolve; }); if (fail) throw new Error('遅い保存失敗'); }, 100000);
    delayed.begin({ name: '元', note: '元の備考' }, 'old'); delayed.change({ name: '保存開始', note: '元の備考' });
    const saving = delayed.flush(); delayed.change({ name: '保存中の追加入力', note: '元の備考' });
    delayed.syncSaved({ name: '新しい所有者', note: '新しい備考' }, 'new'); finish(); await saving;
    assert.equal(delayed.getSnapshot().draft.name, '保存中の追加入力'); assert.equal(delayed.hasSourceChange(), true);
    assert.match(delayed.getSnapshot().error, /編集対象/); await delayed.flush();
    // A repeated publication stays blocked; restoring the original owner resumes ordinary field reconciliation.
    delayed.syncSaved({ name: '最新の置換先', note: '最新の備考' }, 'new');
    assert.equal(delayed.getSnapshot().draft.name, '保存中の追加入力');
    delayed.syncSaved({ name: '元', note: '他ウィンドウの備考' }, 'old');
    assert.equal(delayed.hasSourceChange(), false); assert.equal(delayed.getSnapshot().draft.note, '他ウィンドウの備考');
    assert.equal(delayed.getSnapshot().draft.name, '保存中の追加入力'); delayed.discard(); delayed.end();
  }
  for (const delayedResult of ['idle', 'success', 'failure']) {
    let finish, writes = 0;
    const missing = new api.AutoSave(async () => {
      writes++;
      if (delayedResult !== 'idle') await new Promise(resolve => { finish = resolve; });
      if (delayedResult === 'failure') throw new Error('遅い保存失敗');
    }, 100000);
    missing.begin({ name: '削除前の対象' }); missing.change({ name: '回収する未保存入力' });
    const saving = delayedResult === 'idle' ? Promise.resolve() : missing.flush();
    missing.sourceMissing(); finish?.(); await saving;
    await missing.flush();
    assert.equal(writes, delayedResult === 'idle' ? 0 : 1, '消失後は自動保存・再試行を開始しない');
    assert.equal(missing.getSnapshot().draft.name, '回収する未保存入力');
    assert.match(missing.getSnapshot().error, /削除されています/);
    missing.syncSaved({ name: '同じ番号で作り直した対象' });
    await missing.flush();
    assert.equal(missing.getSnapshot().draft.name, '回収する未保存入力', '同番号の再登場へ旧入力を転用しない');
    assert.equal(missing.hasSourceChange(), true);
    missing.sourceMissing(); missing.discard();
    assert.equal(missing.getSnapshot().draft, null);
    assert.equal(missing.getSnapshot().pending, false);
    missing.end();
  }
  // Focus changes and explicit navigation may flush the same pending editor together.
  // A second input must complete without an already-running write causing a busy loop.
  let releaseFirst, startedFirst;
  const started = new Promise(resolve => { startedFirst = resolve; });
  const commits = [];
  const concurrent = new api.AutoSave(async draft => {
    commits.push(draft);
    if (commits.length === 1) { startedFirst(); await new Promise(resolve => { releaseFirst = resolve; }); }
    else await new Promise(resolve => setTimeout(resolve, 5));
  }, 100000);
  const unregister = api.registerAutoSave(concurrent);
  let attempts = 0;
  const flush = concurrent.flush.bind(concurrent);
  concurrent.flush = async () => { if (++attempts > 5) throw new Error('進行中の保存を待たず再試行しました'); await flush(); };
  try {
    concurrent.begin('元'); concurrent.change('最初');
    const firstFlush = api.flushAutoSaves(); await started;
    concurrent.change('保存中の追加入力');
    const secondFlush = api.flushAutoSaves(); releaseFirst();
    await Promise.all([firstFlush, secondFlush]);
    assert.deepEqual(commits, ['最初', '保存中の追加入力']); assert.equal(concurrent.getSnapshot().pending, false);
  } finally { unregister(); concurrent.cancelTimer(); }
  for (const waiters of [2, 3]) for (const message of ['入力不備', '書き込み拒否']) for (const correctImmediately of [false, true]) {
    let release, attempts = 0;
    const failing = new api.AutoSave(async () => {
      attempts++;
      if (attempts === 1) { await new Promise(resolve => { release = resolve; }); throw new Error(message); }
    }, 100000);
    const remove = api.registerAutoSave(failing);
    const stop = failing.subscribe(() => {
      if (correctImmediately && failing.getSnapshot().error) failing.change('訂正済み');
    });
    try {
      failing.begin('元'); failing.change('不正な入力');
      const pending = Array.from({ length: waiters }, () => api.flushAutoSaves());
      release();
      const results = await Promise.allSettled(pending);
      assert.equal(attempts, 1, '同じ失敗を待った要求は保存を再試行しない');
      assert.ok(results.every(result => result.status === 'rejected' && result.reason.message === message));
      assert.equal(failing.getSnapshot().pending, true);
      assert.equal(failing.getSnapshot().draft, correctImmediately ? '訂正済み' : '不正な入力');
      // A new, explicit request can retry after the failed callers have all settled.
      if (!correctImmediately) failing.change('訂正済み');
      await api.flushAutoSaves();
      assert.equal(attempts, 2); assert.equal(failing.getSnapshot().pending, false);
    } finally { stop(); remove(); failing.cancelTimer(); }
  }
  console.log('PASS: 編集元の作成識別子保護、遅延保存の成功/失敗、最新入力の回収、参照再確認、独立登録と取消やり直し');
}
