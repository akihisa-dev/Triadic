import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowCloseJoin(api) {
  const initial = await api.createTriadicDatabase(2026);
  const file = name => {
    let bytes = initial, held;
    const pause = async stage => {
      if (held?.stage !== stage) return;
      const gate = held; held = undefined; gate.enter(); await gate.wait;
      if (gate.failure) throw new Error('終了時の保存失敗');
      return gate.denied ? 'denied' : undefined;
    };
    const handle = { name, isSameEntry: async other => other === handle, getFile: async () => new File([bytes], name),
      queryPermission: async () => await pause('permission') ?? 'granted',
      createWritable: async () => { let next; return { write: async value => { next = new Uint8Array(value).slice(); }, close: async () => { await pause('write'); bytes = next; }, abort: async () => {} }; } };
    return { handle, get bytes() { return bytes; }, replace(value) { bytes = value; }, hold(stage, mode) {
      let enter, release;
      const started = new Promise(resolve => { enter = resolve; }), wait = new Promise(resolve => { release = resolve; });
      held = { stage, enter, wait, failure: mode === 'failure', denied: mode === 'denied' };
      return { started, release };
    } };
  };
  for (const entry of ['open', 'join']) for (const outcome of ['success', 'failure', 'denied', 'recovery']) {
    const hub = new api.WindowSessionHub(), source = file('通常終了.triadic'), destination = file('復旧先.triadic'), other = file('別ファイル.triadic');
    const a = connectWindowSession(api, hub), b = connectWindowSession(api, hub), d = connectWindowSession(api, hub);
    let gate, unregister;
    try {
      await a.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
      await a.session.dispatch({ type: 'settings', change: { type: 'selection', screen: 'cost-table', selected: [2] } });
      const group = a.session.getWindowSnapshot().group;
      if (outcome === 'recovery') {
        source.replace(await api.saveKindSelection(source.bytes, 'initiative-list', [1]));
        unregister = api.registerFileConflictRecovery(async () => api.captureRecoveryDestination(destination.handle));
      }
      gate = (outcome === 'recovery' ? destination : source).hold(outcome === 'denied' ? 'permission' : 'write', outcome);
      const closing = Promise.allSettled([a.session.close(async () => source.handle)]);
      await gate.started;
      let settled = false;
      const joining = Promise.allSettled([entry === 'open' ? b.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes }) : b.session.call('join', group, null)]).then(result => { settled = true; return result; });
      await d.session.open({ name: other.handle.name, handle: other.handle, bytes: other.bytes });
      assert.equal(settled, false, '終了結果が決まるまで参加を待ち、別ファイルの操作は妨げない');
      assert.equal(b.session.getWindowSnapshot().group, null);
      gate.release();
      const [closed] = await closing, [joined] = await joining;
      const succeeds = outcome === 'success' || outcome === 'recovery';
      assert.equal(closed.status, succeeds ? 'fulfilled' : 'rejected');
      if (entry === 'join' && succeeds) {
        assert.equal(joined.status, 'rejected', '閉じたworkspaceへ孤立参加させず、通常openを案内する');
        assert.match(joined.reason.message, /参加できません|閉じられています/);
        assert.equal(b.session.getWindowSnapshot().group, null);
        await b.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
      } else assert.equal(joined.status, 'fulfilled');
      assert.ok(b.session.getSnapshot().contents);
      assert.equal(b.session.getSnapshot().name, source.handle.name);
      assert.deepEqual(b.session.getSnapshot().contents.kindSelections['cost-table'], [2]);
      assert.equal(b.session.getWindowSnapshot().peers, succeeds ? 1 : 2);
      await b.session.close(async () => source.handle);
      assert.equal(b.session.getWindowSnapshot().group, null);
      await b.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
      assert.ok(b.session.getSnapshot().contents, '閉じる・開くを通常どおり続けられる');
      if (outcome === 'recovery') await api.validateTriadicDatabase(destination.bytes);
      await api.validateTriadicDatabase(source.bytes);
    } finally { gate?.release(); unregister?.(); a.dispose(); b.dispose(); d.dispose(); }
  }
  const hub = new api.WindowSessionHub(), source = file('共有継続.triadic'), a = connectWindowSession(api, hub), b = connectWindowSession(api, hub);
  try {
    await a.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
    await b.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
    await a.session.dispatch({ type: 'settings', change: { type: 'selection', screen: 'cost-table', selected: [2] } });
    await a.session.close(async () => source.handle);
    assert.ok(b.session.getSnapshot().contents); assert.equal(b.session.getWindowSnapshot().peers, 1);
    assert.equal(b.session.getSnapshot().canUndo, true, '既存の参加者と操作取消を保持');
  } finally { a.dispose(); b.dispose(); }
  console.log('PASS: 通常終了中のopen/join待機、成功・失敗・許可拒否・競合復旧、再open/close、共有継続と取消・別ファイルの独立性');
}
