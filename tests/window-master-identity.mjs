import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowMasterIdentity(api) {
  for (const type of ['expansion', 'period', 'aggregation']) {
    let stored = await api.createTriadicDatabase(2026), writes = 0, hold = false, entered;
    const handle = { name: '対象の連続性.triadic', isSameEntry: async other => other === handle,
      getFile: async () => new File([stored], handle.name), createWritable: async () => { let next; return {
        write: async value => { next = new Uint8Array(value).slice(); }, close: async () => { stored = next; writes++; }, abort: async () => {},
      }; } };
    const hub = new api.WindowSessionHub();
    const a = connectWindowSession(api, hub, { toHub(message) {
      if (hold && message.method === 'dispatch') { hold = false; entered(); return 'hold'; }
    } }), b = connectWindowSession(api, hub);
    const collection = type === 'expansion' ? 'expansions' : type === 'period' ? 'periodTypes' : 'aggregations';
    const rows = () => a.session.getSnapshot().contents[collection];
    const fields = (name, code = '99') => type === 'expansion' ? { expansionCode: code, expansionName: name } : type === 'period' ? { periodName: name } : { name, displayName: name, members: [] };
    const input = item => type === 'expansion' ? { expansionCode: item.expansionCode, expansionName: item.expansionName } : type === 'period' ? { periodName: item.periodName } : { name: item.name, displayName: item.displayName ?? item.name, members: item.members };
    let controller, unsubscribe;
    try {
      await a.session.open({ name: handle.name, handle, bytes: stored }); await b.session.open({ name: handle.name, handle, bytes: stored });
      await b.session.dispatch({ type, change: { type: 'add', ...fields('元の対象') } });
      const old = rows().at(-1);
      controller = new api.AutoSave(draft => a.session.dispatch({ type, change: { type: 'update', id: old.id, ...draft } }), 100000);
      controller.begin(input(old));
      unsubscribe = a.session.subscribe(() => {
        const latest = rows().find(row => row.id === old.id);
        if (latest) controller.syncSaved(input(latest)); else controller.sourceMissing();
      });
      controller.change(fields('回収する旧入力'));
      const started = new Promise(resolve => { entered = resolve; }); hold = true;
      const saving = controller.flush(); await started;
      await b.session.dispatch({ type, change: { type: 'delete', id: old.id } });
      await b.session.dispatch({ type, change: { type: 'add', ...fields('後から作成した別対象', '98') } });
      assert.equal(rows().at(-1).id, old.id);
      const before = stored.slice(), count = writes;
      await a.releaseHeld(); await saving;
      assert.equal(controller.getSnapshot().pending, true);
      assert.deepEqual(controller.getSnapshot().draft, fields('回収する旧入力'));
      await controller.flush();
      assert.equal(writes, count); assert.deepEqual(stored, before, `${type}: 旧更新を再作成先へ適用しない`);
      unsubscribe(); unsubscribe = null; controller.discard();
      await a.session.dispatch({ type, change: { type: 'update', id: old.id, ...fields('選び直した新対象', '98') } });
      if (type === 'expansion') {
        const started = new Promise(resolve => { entered = resolve; }); hold = true;
        const editing = a.session.dispatch({ type, change: { type: 'update', id: old.id, ...fields('名称の独立変更', '98') } });
        await started;
        await b.session.dispatch({ type, change: { type: 'update', id: old.id, ...fields('選び直した新対象', '97') } });
        await a.releaseHeld(); await editing;
        assert.equal(rows().at(-1).expansionName, '名称の独立変更'); assert.equal(rows().at(-1).expansionCode, '97');
      }
      if (type === 'aggregation') for (const subject of ['parent', 'member']) {
        const group = rows().at(-1), account = a.session.getSnapshot().contents.accounts[0];
        const command = { type, change: { type: 'move', member: subject === 'parent' ? { kind: 'account', id: account.id } : { kind: 'group', id: group.id }, parentId: subject === 'parent' ? group.id : null, sign: 1 } };
        const started = new Promise(resolve => { entered = resolve; }); hold = true;
        const moving = a.session.dispatch(command), result = assert.rejects(moving, /削除・再作成/);
        await started;
        await b.session.dispatch({ type, change: { type: 'delete', id: group.id } });
        await b.session.dispatch({ type, change: { type: 'add', name: `新しい${subject}` } });
        assert.equal(rows().at(-1).id, group.id);
        const before = stored.slice(), count = writes;
        await a.releaseHeld(); await result;
        assert.equal(writes, count); assert.deepEqual(stored, before);
        await a.session.dispatch(command);
        if (subject === 'parent') await a.session.dispatch({ type, change: { type: 'move', member: command.change.member, parentId: null, sign: 1 } });
      }
    } finally { unsubscribe?.(); controller?.cancelTimer(); a.dispose(); b.dispose(); }
  }
  console.log('PASS: 展開・期間・集計の削除再作成後の旧更新拒否、入力保持・再選択、独立編集統合、集計の移動元/移動先の再作成拒否');
}
