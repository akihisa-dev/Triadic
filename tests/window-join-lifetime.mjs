import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowJoinLifetime(api) {
  const initial = await api.createTriadicDatabase(2026);
  const file = name => {
    let bytes = initial, pause = async () => {};
    const handle = { name, isSameEntry: async other => other === handle,
      getFile: async () => new File([bytes], name), queryPermission: async () => 'granted',
      createWritable: async () => { let next; return { write: async value => { next = new Uint8Array(value).slice(); },
        close: async () => { await pause(); bytes = next; }, abort: async () => {} }; } };
    return { handle, get bytes() { return bytes; }, hold(callback) { pause = callback; } };
  };
  for (const failure of [false, true]) {
    const hub = new api.WindowSessionHub(), source = file('解放待ち.triadic');
    const a = connectWindowSession(api, hub), c = connectWindowSession(api, hub), d = connectWindowSession(api, hub);
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    source.hold(async () => { entered(); await gate; if (failure) throw new Error('保存失敗'); });
    try {
      await a.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
      const group = a.session.getWindowSnapshot().group;
      const saving = a.session.dispatch({ type: 'settings', change: { type: 'selection', screen: 'cost-table', selected: [2] } });
      const saved = Promise.allSettled([saving]);
      await started; a.disconnect();
      await assert.rejects(c.session.call('join', group, null), /閉じられています/);
      assert.equal(c.session.getWindowSnapshot().group, null);
      release(); await saved;
      await Promise.all([...hub.groups.values()].map(item => item.releasing));
      assert.equal(hub.groups.size, 0);
      await d.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
      assert.deepEqual(d.session.getSnapshot().contents.kindSelections['cost-table'], failure ? [1] : [2]);
      assert.equal(d.session.getWindowSnapshot().peers, 1);
    } finally { release(); a.dispose(); c.dispose(); d.dispose(); }
  }
  for (const disconnect of [false, true]) {
    const hub = new api.WindowSessionHub(), source = file('共有元.triadic'), destination = file('共有先.triadic');
    const a = connectWindowSession(api, hub), c = connectWindowSession(api, hub);
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    destination.hold(async () => { entered(); await gate; });
    try {
      await a.session.open({ name: source.handle.name, handle: source.handle, bytes: source.bytes });
      const saving = a.session.saveAs(async () => destination.handle);
      await started;
      const joining = c.session.call('join', a.session.getWindowSnapshot().group, null);
      const result = Promise.allSettled([joining]);
      if (disconnect) c.disconnect();
      release(); await saving;
      const [joined] = await result;
      assert.equal(joined.status, disconnect ? 'rejected' : 'fulfilled');
      assert.equal(a.session.getWindowSnapshot().peers, disconnect ? 1 : 2);
      if (disconnect) {
        await a.session.call('history');
        assert.equal(a.session.getWindowSnapshot().peers, 1, '残る画面の共有操作を妨げない');
      } else {
        await a.session.saveAs(async () => source.handle);
        assert.equal(c.session.getSnapshot().name, source.handle.name, '正常参加した画面へ共有を維持する');
      }
    } finally { release(); a.dispose(); c.dispose(); }
  }
  console.log('PASS: 解放待ちjoinの拒否・受理済み保存の成功/失敗・最新状態からの再open、待機中切断の除外、正当なjoin待ちと履歴操作');
}
