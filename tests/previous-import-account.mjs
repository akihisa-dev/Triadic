import assert from 'node:assert/strict';

export async function verifyPreviousImportAccount(api) {
  let stored = await api.createTriadicDatabase(2026), writes = 0;
  const handle = { name: '前年取込.triadic', isSameEntry: async other => other === handle,
    queryPermission: async () => 'granted', getFile: async () => new File([stored], handle.name),
    createWritable: async () => { let next; return {
      write: async value => { next = new Uint8Array(value).slice(); },
      close: async () => { stored = next; writes++; }, abort: async () => {},
    }; },
  };
  const hub = new api.WindowSessionHub(), connections = [];
  function windowSession() {
    const session = new api.WindowPlanSession();
    session.started = Promise.resolve();
    const connection = hub.connect({ postMessage: message => queueMicrotask(() => { void session.receive(message); }) });
    session.port = { postMessage: message => queueMicrotask(() => connection.receive(message)) };
    session.registerControls({ draft: () => false, discard: () => {}, close: () => {}, confirmDiscard: async () => true });
    connections.push(connection); return session;
  }
  const a = windowSession(), b = windowSession();
  try {
    await a.open({ name: handle.name, handle, bytes: stored });
    await b.open({ name: handle.name, handle, bytes: stored });
    const original = { accountCode: '999', accountName: '取込対象の旧科目', accountType: 'expense' };
    await b.dispatch({ type: 'account', change: { type: 'add', ...original } });
    const before = a.getSnapshot().contents, old = before.accounts.at(-1);
    const pair = { industryId: before.departments[0].industryIds[0], departmentId: before.departments[0].id };
    const book = api.createPreviousWorkbook(before, [pair]);
    const sheet = book.worksheets.find(item => item.name !== '_triadichrome');
    sheet.getCell(before.accounts.findIndex(item => item.id === old.id) + 4, 3).value = 123.456;
    sheet.getCell(4, 4).value = 1; // A valid earlier patch must not partially save on rejection.
    const encoded = await api.serializeWorkbook(book);
    const patches = await api.parsePreviousWorkbook(encoded, before);
    const confirmed = structuredClone(patches);
    const command = { type: 'settings', change: { type: 'previous-import', patches } };
    for (const replacement of [
      { ...original, accountName: '別の新科目' },
      { ...original, accountType: 'profit' },
      { ...original, accountCode: '998' },
    ]) {
      await b.travelOperation(-1);
      await b.dispatch({ type: 'account', change: { type: 'add', ...replacement } });
      assert.equal(a.getSnapshot().contents.accounts.at(-1).id, old.id, '実際の操作取消で番号が再利用される');
      const untouched = stored.slice(), writeCount = writes;
      for (let retry = 0; retry < 2; retry++) await assert.rejects(a.dispatch(command), /マスタが変更/);
      assert.deepEqual(stored, untouched, '一部が有効でも取込全体を保存しない');
      assert.equal(writes, writeCount);
      assert.deepEqual(patches, confirmed, '失敗後も確認した値と科目基準を保持');
    }
    // Restore the original account, then change an unrelated classification and presentation.
    await b.travelOperation(-1);
    await b.dispatch({ type: 'account', change: { type: 'add', ...original, displayName: '表示名のみ' } });
    await b.dispatch({ type: 'period', change: { type: 'add', periodName: '無関係な新期間' } });
    await a.dispatch(command);
    assert.equal((await api.readPlanContents(stored)).previousAmounts.find(item => item.accountId === old.id && item.month === 4).amount, '123.456');
    await assert.rejects(a.dispatch(command), /前年金額が変更/, '同じ科目への金額競合は引き続き拒否');
    await b.travelOperation(-1);
    assert.equal((await api.readPlanContents(stored)).previousAmounts.length, 0, '取り込み全体を一度で取り消せる');
    await a.dispatch(command);
    const latest = a.getSnapshot().contents;
    assert.deepEqual(await api.parsePreviousWorkbook(await api.serializeWorkbook(api.createPreviousWorkbook(latest, [pair])), latest), []);
    console.log('PASS: 前年Excelの確認後の科目番号再利用・名称/コード/属性変更を拒否、再試行・原子性・無関係な更新・通常取込・取消を検証');
  } finally { for (const connection of connections) connection.disconnect(); }
}
