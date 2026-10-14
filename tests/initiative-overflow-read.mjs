import assert from 'node:assert/strict';

export async function verifyInitiativeOverflowRead(api) {
  for (const kind of [1, 2]) {
    let bytes = await api.createInitiativeOverflowPlan(kind);
    const original = bytes.slice();
    await api.validateTriadicDatabase(bytes);
    const contents = await api.readPlanContents(bytes);
    assert.deepEqual(contents.initiatives[0].months, {}, '読込は表示用の集計を実行しない');
    assert.equal(api.resolvedAmount(contents.initiatives[0].rows[0], kind, 4), '5000000000000');
    assert.throws(() => api.initiativesForKind(contents.initiatives, contents.accounts, kind), /範囲を超え/);
    assert.deepEqual(bytes, original, '読込は元の金額を変更しない');
    const handle = { name: 'overflow.triadic', async getFile() { return new File([bytes], this.name); },
      async createWritable() { let pending; return { async write(value) { pending = new Uint8Array(value); },
        async close() { bytes = pending; }, async abort() {} }; } };
    const session = new api.PlanSession();
    const noPicker = async () => { throw new Error('保存先を選び直さない'); };
    await session.open({ bytes, handle, name: handle.name });
    const draftOf = item => ({ ...structuredClone(item), fiscalYear: '2026' });
    const draft = draftOf(contents.initiatives[0]);
    await session.dispatch({ type: 'initiative.register', draft: { ...draft, name: '新規超過', rows: draft.rows.map(({ id, ...row }) => row) } }, noPicker);
    const id = session.getSnapshot().contents.initiatives.at(-1).id;
    const correction = draftOf(session.getSnapshot().contents.initiatives.at(-1));
    if (kind === 1) correction.rows[0].amounts[4] = '1';
    else correction.rows[0].overrides[2][4] = '1';
    await session.dispatch({ type: 'initiative.update', id, draft: correction }, noPicker);
    const projected = () => api.initiativesForKind(session.getSnapshot().contents.initiatives.filter(item => item.id === id), contents.accounts, kind);
    assert.equal(projected()[0].months[4].sales, 5000000000001000);
    await session.travelOperation(-1, noPicker);
    assert.throws(projected, /範囲を超え/);
    await session.checkpoint(true, noPicker);
    const historyId = session.getSnapshot().history.entries[0].id;
    const historical = await session.preview(historyId, noPicker);
    assert.equal(api.resolvedAmount(historical.initiatives.find(item => item.id === id).rows[0], kind, 4), '5000000000000');
    assert.throws(() => api.initiativesForKind(historical.initiatives, historical.accounts, kind), /範囲を超え/);
    await session.travelOperation(1, noPicker);
    assert.equal(projected()[0].months[4].sales, 5000000000001000);
    await session.restore(historyId, noPicker);
    assert.throws(projected, /範囲を超え/);
    await session.close(noPicker);
    await session.open({ bytes, handle, name: handle.name });
    assert.throws(projected, /範囲を超え/);
    await api.validateTriadicDatabase(bytes);
  }
  console.log('PASS: 一次・確定の施策合計超過でも登録・更新・読込・取消やり直し・履歴閲覧復元を維持');
}
