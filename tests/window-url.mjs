import assert from 'node:assert/strict';
import { cloneWindowMessage } from './window-transport.mjs';

/** Real initialization/client/hub/SQLite; browser URL/lifetime and file transport are doubles. */
export async function verifyWindowUrl(api) {
  const initial = await api.createTriadicDatabase(2026), hub = new api.WindowSessionHub();
  function file(name) {
    let bytes = initial.slice();
    const result = { fail: false, denied: false };
    const handle = { name, isSameEntry: async other => other === handle,
      queryPermission: async () => result.denied ? 'denied' : 'granted',
      getFile: async () => new File([bytes], name),
      createWritable: async () => { let next; return {
        write: async value => { if (result.fail) throw new Error('確認用の保存失敗'); next = new Uint8Array(value); },
        close: async () => { bytes = next; }, abort: async () => {},
      }; },
    };
    return Object.assign(result, { handle, plan: () => ({ name, handle, bytes }) });
  }
  const source = file('A.triadic'), target = file('B.triadic');
  let sequence = 0;
  const pending = new Map();
  const owner = hub.connect({ postMessage(message) {
    if (message.type === 'result') {
      const request = pending.get(message.id); pending.delete(message.id);
      message.error ? request.reject(new Error(message.error)) : request.resolve(message.value);
    }
    if (message.type === 'saved' || message.type === 'control') queueMicrotask(() => owner.receive({ type: 'reply', id: message.id, value: false }));
  } });
  const request = (method, ...args) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); owner.receive({ type: 'request', id, method, args });
  });
  const originals = new Map(['location', 'history', 'navigator', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let url = new URL('https://triadic.test/index.html?source=kept#other=kept'), callbacks = new Map();
  const clients = [];
  const view = { screen: { page: 'cost-table', selectedInitiative: null, detailOrigin: 'initiative-list' }, costTable: { industries: [], departments: [], top: 0, left: 0 }, relation: null, values: {}, scroll: [] };
  function install() {
    callbacks = new Map();
    Object.defineProperty(globalThis, 'location', { configurable: true, get: () => url });
    Object.defineProperty(globalThis, 'history', { configurable: true, value: { state: { kept: true }, replaceState(state, _, path) { assert.deepEqual(state, { kept: true }); url = new URL(path, url); } } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_name, operation) => operation() } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: (name, callback) => callbacks.set(name, callback) } });
  }
  async function start() {
    install();
    const port = { onmessage: null, postMessage: message => queueMicrotask(() => connection.receive(cloneWindowMessage(message))), start() {}, close: () => connection.disconnect() };
    const connection = hub.connect({ postMessage: message => queueMicrotask(() => { void port.onmessage?.({ data: cloneWindowMessage(message) }); }) });
    const session = new api.WindowPlanSession(() => ({ port, onerror: null }));
    const unsubscribe = session.subscribe(() => {}); await session.started;
    const leave = callbacks.get('pagehide'); clients.push(() => { leave(); unsubscribe(); });
    return { session, leave };
  }
  try {
    await request('open', source.plan());
    const group = [...hub.groups.keys()][0]; await request('reserve', 'initial-view', view);
    url.hash = new URLSearchParams({ workspace: group, view: 'initial-view', other: 'kept' }).toString();
    const copy = await start();
    assert.equal(copy.session.getSnapshot().name, 'A.triadic');
    assert.deepEqual(copy.session.getWindowSnapshot().initialView, view);
    assert.equal(url.hash.includes('view='), false); assert.equal(new URLSearchParams(url.hash.slice(1)).get('workspace'), group);
    copy.leave();
    const reloaded = await start();
    assert.equal(reloaded.session.getSnapshot().name, 'A.triadic', '同一ファイル継続中のreloadは再参加');
    // Preserve the reference when closure fails before membership changes.
    await reloaded.session.dispatch({ type: 'settings', change: { type: 'selection', screen: 'cost-table', selected: [2] } });
    // A shared close normally only detaches. Force a pending flush rejection through the real client control.
    reloaded.session.registerControls({ draft: () => false, discard() {}, close() {}, confirmDiscard: async () => true, processing: () => true });
    const before = url.href;
    await assert.rejects(reloaded.session.close(), /処理中/);
    assert.equal(url.href, before); assert.equal(reloaded.session.getSnapshot().name, 'A.triadic');
    reloaded.session.registerControls({ draft: () => false, discard() {}, close() {}, confirmDiscard: async () => true });
    await reloaded.session.close();
    assert.equal(new URLSearchParams(url.hash.slice(1)).has('workspace'), false);
    assert.equal(new URLSearchParams(url.hash.slice(1)).get('other'), 'kept'); assert.equal(url.search, '?source=kept');
    await reloaded.session.open(target.plan());
    assert.equal(reloaded.session.getSnapshot().name, 'B.triadic'); assert.equal(url.href, before.replace(/workspace=[^&]*&?/, ''));
    reloaded.leave();
    const changed = await start();
    assert.equal(changed.session.getSnapshot().contents, null, '別ファイルへの切替後にreloadしても旧Aへ戻らない');
    assert.ok(hub.groups.has(group), '元Aは別ウィンドウで存続');
    await changed.session.open(target.plan()); assert.equal(new URLSearchParams(url.hash.slice(1)).has('workspace'), false, '通常openに自動再参加を追加しない');
    const currentGroup = changed.session.getWindowSnapshot().group;
    url.hash = new URLSearchParams({ workspace: currentGroup, other: 'kept' }).toString();
    await changed.session.dispatch({ type: 'settings', change: { type: 'selection', screen: 'cost-table', selected: [2] } });
    const currentUrl = url.href, current = changed.session.getSnapshot();
    for (const failure of ['fail', 'denied']) {
      target[failure] = true;
      await assert.rejects(changed.session.close(), failure === 'fail' ? /保存失敗/ : /許可/);
      target[failure] = false;
      assert.equal(url.href, currentUrl); assert.equal(changed.session.getSnapshot().contents, current.contents);
      assert.equal(changed.session.getWindowSnapshot().group, currentGroup);
    }
    await request('close'); await request('join', currentGroup, null);
    const renamed = file('別名.triadic');
    await changed.session.saveAs(async () => renamed.handle);
    assert.equal(url.href, currentUrl); assert.equal(changed.session.getSnapshot().name, '別名.triadic');
    changed.leave();
    const savedReload = await start();
    assert.equal(savedReload.session.getSnapshot().name, '別名.triadic', '別名保存後も同じ共有先で再参加する');
    console.log('PASS: 実初期化の複製・view消費・同一共有reload・終了失敗の参照保持・正常closeと別ファイルreload・通常open・URL他項目を維持');
  } finally {
    for (const dispose of clients) dispose(); owner.disconnect();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}
