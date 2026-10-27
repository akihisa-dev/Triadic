import assert from 'node:assert/strict';
export async function verifyNoChangeSave(api) {
  const base = await api.createTriadicDatabase(2026);
  const now = '2026-10-11T00:00:00.000Z';
  const tasks = api.processingTasks;
  const sql = await api.initializeSqlite();
  const originalRun = sql.Database.prototype.run;
  let snapshots = 0;
  sql.Database.prototype.run = function(statement, params) {
    if (statement.startsWith("ATTACH DATABASE")) snapshots++;
    return originalRun.call(this, statement, params);
  };
  try {
  const metadata = async bytes => {
    const db = await api.openTriadicDatabase(bytes);
    try { return ['document_info', 'data_history_state'].map(table => db.exec(`SELECT * FROM ${table}`)[0].values); }
    finally { db.close(); }
  };
  const changed = await tasks.prepareKindSelectionSave(base, 'cost-table', [2], now);
  assert.ok(changed.operation);
  assert.equal(snapshots, 2, '正当な変更は前後の保存状態を各1回作る');
  assert.equal(changed.savedHistory.entries.length, 1);
  assert.equal(changed.savedHistory.dirtySince, now);
  const checkpoint = await api.recordDataHistory(changed.bytes, '2026-10-11T00:05:00.000Z');
  for (const bytes of [base, changed.bytes, checkpoint]) {
    const contents = await api.readPlanContents(bytes);
    const before = await metadata(bytes);
    const member = contents.aggregations.flatMap(group => group.members.map(item => ({...item, parentId:group.id})))[0];
    snapshots = 0;
    for (const prepared of [
      await tasks.prepareKindSelectionSave(bytes, 'cost-table', contents.kindSelections['cost-table'], now),
      await tasks.prepareComparisonSelectionSave(bytes, 'cost-table', contents.kindSelections['cost-table'], contents.previousSelections['cost-table'], now),
      await tasks.prepareAggregationSave(bytes, {type:'move',member,parentId:member.parentId,sign:member.sign}, now),
      await tasks.prepareAggregationSave(bytes, {type:'update',...contents.aggregations[0]}, now),
    ]) {
      assert.equal(prepared.operation, null);
      assert.equal(prepared.bytes, bytes, '無変更は元bytesを返す');
      assert.deepEqual(await metadata(prepared.bytes), before, '更新日時・履歴管理状態を保護');
      assert.deepEqual(prepared.savedHistory, await api.readDataHistory(bytes));
    }
    assert.equal(snapshots, 0, '無変更の種別・所属・集計更新は取消用コピーを作らない');
    await assert.rejects(tasks.prepareKindSelectionSave(bytes, 'cost-table', [1, 1], now), /種別/);
    await assert.rejects(tasks.prepareKindSelectionSave(bytes, 'unknown', [1], now), /表示対象/);
    await assert.rejects(tasks.prepareComparisonSelectionSave(bytes, 'cost-table', [1], {1:3,2:1}, now), /基準前年/);
    await assert.rejects(tasks.prepareComparisonSelectionSave(bytes, 'initiative-list', [1], {1:1,2:1}, now), /基準前年/);
    await assert.rejects(tasks.prepareAggregationSave(bytes, {type:'move',member:{kind:'account',id:999999},parentId:member.parentId,sign:1},now), /見つかりません/);
    assert.equal(snapshots, 0, '不正入力はコピー作成より先に拒否');
    let writes = 0, reads = 0, notifications = 0;
    const handle = {name:'同値.triadic',async getFile(){reads++; throw new Error('同値でファイルを読まない');},async createWritable(){writes++;throw new Error('同値で書かない');}};
    const session = new api.PlanSession();
    await session.open({...contents,bytes,handle,name:handle.name});
    session.subscribeFileSave(async () => {notifications++;});
    const beforeSnapshot = session.getSnapshot();
    const picker = async () => {throw new Error('同値で保存先を選ばない');};
    await session.dispatch({type:'settings',change:{type:'selection',screen:'cost-table',selected:contents.kindSelections['cost-table']}},picker);
    await session.dispatch({type:'settings',change:{type:'comparison',screen:'cost-table',selected:contents.kindSelections['cost-table'],previous:contents.previousSelections['cost-table']}},picker);
    await session.dispatch({type:'aggregation',change:{type:'move',member,parentId:member.parentId,sign:member.sign}},picker);
    await session.dispatch({type:'account',change:{type:'reorder',ids:contents.accounts.map(account => account.id)}},picker);
    assert.equal(writes,0); assert.equal(reads,0); assert.equal(notifications,0);
    assert.equal(session.getSnapshot().contents,beforeSnapshot.contents);
    assert.deepEqual(session.getSnapshot().history,beforeSnapshot.history);
    assert.equal(session.getSnapshot().canUndo,false);
  }
  assert.equal(await api.recordDataHistory(base,'2026-10-11T00:10:00.000Z',true),base);
  assert.equal((await api.readDataHistory(checkpoint)).dirtySince,null);
  assert.equal((await api.readDataHistory(checkpoint)).entries.length,2);
  console.log('PASS: 同値保存の日時・履歴・期限・元bytes保持、書込と競合処理なし、通常変更と5分記録');
  } finally { sql.Database.prototype.run = originalRun; }
}
