import { connectWindowSession } from "./window-transport.mjs";
import assert from 'node:assert/strict';

export async function verifyWindowMasterDelete(api) {
  let stored = await api.createTriadicDatabase(2026), writes = 0;
  const handle = { name: '削除確認.triadic', isSameEntry: async other => other === handle,
    queryPermission: async () => 'granted', getFile: async () => new File([stored], handle.name),
    createWritable: async () => { let next; return { write: async value => { next = new Uint8Array(value).slice(); },
      close: async () => { stored = next; writes++; }, abort: async () => {} }; },
  };
  const hub = new api.WindowSessionHub(), connections = [];
  const peer = () => {
    const connection = connectWindowSession(api, hub);
    connections.push(connection); return connection.session;
  };
  const a = peer(), b = peer();
  try {
    await a.open({ name: handle.name, handle, bytes: stored }); await b.open({ name: handle.name, handle, bytes: stored });
    for (const type of ['period', 'aggregation']) {
      const rows = () => a.getSnapshot().contents[type === 'period' ? 'periodTypes' : 'aggregations'];
      const key = type === 'period' ? api.periodDeletionKey : api.aggregationDeletionKey;
      const add = name => ({ type, change: { type: 'add', ...(type === 'period' ? { periodName: name } : { name }) } });
      await b.dispatch(add('確認した対象'));
      const target = rows().at(-1);
      const confirmed = { type, change: { type: 'delete', id: target.id, deletionKey: key(target) } };
      await b.dispatch({ type, change: { type: 'delete', id: target.id } });
      await assert.rejects(a.dispatch(confirmed), /変更|見つかりません/, '対象が消えた確認は失敗');
      await b.dispatch(add('同じ番号の別対象'));
      assert.equal(rows().at(-1).id, target.id);
      const original = stored.slice(), count = writes;
      for (let retry = 0; retry < 2; retry++) await assert.rejects(a.dispatch(confirmed), /削除対象.*変更/);
      assert.equal(writes, count); assert.deepEqual(stored, original, '最新表示を受信しても古い確認では書き込まない');
      const current = rows().at(-1), renamed = { type, change: { type: 'update', id: current.id,
        ...(type === 'period' ? { periodName: '確認後に変更' } : { name: current.name, displayName: '確認後に変更', members: [] }) } };
      const beforeRename = { type, change: { type: 'delete', id: current.id, deletionKey: key(current) } };
      await b.dispatch(renamed);
      await assert.rejects(a.dispatch(beforeRename), /削除対象.*変更/);
      const fresh = { type, change: { type: 'delete', id: current.id, deletionKey: key(rows().at(-1)) } };
      await b.dispatch(add('無関係な追加'));
      await a.dispatch(fresh);
      assert.equal(rows().some(row => row.id === current.id), false, '最新の確認は無関係の変更後も正常削除');
      assert.equal(rows().some(row => (row.periodName ?? row.name) === '無関係な追加'), true);
    }
    for (const type of ['department','industry']) {
      const collection=type === 'department'?'departments':'industries';
      const create=name=>({type,change:type === 'department'
        ? {type:'add',departmentName:name,industryIds:[a.getSnapshot().contents.industries[0].id]}
        : {type:'add',industryCode:name === '削除前'?'899':'898',industryName:name}});
      await b.dispatch(create('削除前'));
      const target=a.getSnapshot().contents[collection].at(-1);
      const stale={type,change:{type:'delete',id:target.id,deletionKey:target.identity}};
      await b.dispatch({type,change:{type:'delete',id:target.id}});
      await b.dispatch(create('再作成後'));
      const replacement=a.getSnapshot().contents[collection].find(row=>row.id===target.id);
      assert.ok(replacement);assert.notEqual(replacement.identity,target.identity);
      const previous=stored.slice(), count=writes;
      await assert.rejects(a.dispatch(stale),/削除対象.*変更/);
      assert.equal(writes,count);assert.deepEqual(stored,previous);
      await a.dispatch({type,change:{type:'delete',id:target.id,deletionKey:replacement.identity}});
      assert.equal(a.getSnapshot().contents[collection].some(row=>row.id===target.id),false);
    }
    const period = a.getSnapshot().contents.periodTypes[0], group = a.getSnapshot().contents.aggregations.find(row => row.required);
    await assert.rejects(a.dispatch({ type: 'aggregation', change: { type: 'delete', id: group.id, deletionKey: api.aggregationDeletionKey(group) } }), /必須集計/);
    const contents = a.getSnapshot().contents;
    await b.dispatch({ type: 'initiative.register', draft: { ...api.createInitiativeDraft('2026'), name: '使用中の期間',
      periodTypeId: period.id, departmentId: contents.departments[0].id, industryId: contents.departments[0].industryIds[0], expansionId: contents.expansions[0].id,
      rows: [{ id: 'delete-guard-row', accountId: contents.accounts[0].id, amounts: { 4: '1' } }] } });
    await assert.rejects(a.dispatch({ type: 'period', change: { type: 'delete', id: period.id, deletionKey: api.periodDeletionKey(period) } }), /使用中/);
    console.log('PASS: 期間・任意集計の二画面削除確認、番号再利用、対象変更、再試行、通常削除、使用中の拒否');
  } finally { for (const connection of connections) connection.dispose(); }
}
