import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowAccountDelete(api) {
  let bytes = await api.createTriadicDatabase(2026), writes = 0, fail = false, hold = false, entered;
  const handle = { name: '科目削除.triadic', isSameEntry: async other => other === handle,
    getFile: async () => new File([bytes], handle.name), createWritable: async () => { let next; return {
      write: async value => { if (fail) throw new Error('保存失敗'); next = new Uint8Array(value).slice(); },
      close: async () => { bytes = next; writes++; }, abort: async () => {},
    }; } };
  const hub = new api.WindowSessionHub(), a = connectWindowSession(api, hub, { toHub(message) {
    if (hold && message.method === 'dispatch') { hold = false; entered(); return 'hold'; }
  } }), b = connectWindowSession(api, hub);
  const rows = () => a.session.getSnapshot().contents.accounts;
  const add = (name, code) => ({ type: 'account', change: { type: 'add', accountName: name, accountCode: code, accountType: 'expense' } });
  try {
    await a.session.open({ name: handle.name, handle, bytes }); await b.session.open({ name: handle.name, handle, bytes });
    await b.session.dispatch(add('削除を確認した科目', '999'));
    const old = rows().at(-1), command = { type: 'account', change: { type: 'delete', id: old.id } };
    const started = new Promise(resolve => { entered = resolve; }); hold = true;
    const deleting = a.session.dispatch(command), rejected = assert.rejects(deleting, /削除・再作成/);
    await started;
    const request = a.sent.findLast(message => message.method === 'dispatch');
    await b.session.travelOperation(-1);
    await b.session.dispatch(add('後から追加した別科目', '998'));
    assert.equal(rows().at(-1).id, old.id);
    const before = bytes.slice(), count = writes;
    await a.releaseHeld(); await rejected;
    await assert.rejects(a.session.call('dispatch', command, request.args[1]), /削除・再作成/);
    assert.equal(writes, count); assert.deepEqual(bytes, before);
    fail = true; await assert.rejects(a.session.dispatch(command), /保存失敗/); fail = false;
    assert.deepEqual(bytes, before); await a.session.dispatch(command);
    assert.equal(rows().some(row => row.id === old.id), false);
    await a.session.travelOperation(-1);
    const restored = rows().find(row => row.id === old.id);
    assert.equal(restored.accountName, '後から追加した別科目');
    // Normal updates and reordering retain the same target generation.
    const editingStarted = new Promise(resolve => { entered = resolve; }); hold = true;
    const normal = a.session.dispatch(command); await editingStarted;
    await b.session.dispatch({ type: 'account', change: { type: 'update', id: restored.id, accountCode: '997', accountName: '同じ科目の改名', accountType: 'sales' } });
    await b.session.dispatch({ type: 'account', change: { type: 'reorder', ids: rows().map(row => row.id).reverse() } });
    await a.releaseHeld(); await normal;
    assert.equal(rows().some(row => row.id === old.id), false);
    const used = rows().find(row => row.inUse);
    await assert.rejects(a.session.dispatch({ type: 'account', change: { type: 'delete', id: used.id } }), /使用している/);
  } finally { a.dispose(); b.dispose(); }
  console.log('PASS: 科目削除の送信待ち中の共有取消・同番号再作成拒否、古い再試行拒否、新確認・保存失敗・取消復元、同一科目の編集と使用中保護');
}
