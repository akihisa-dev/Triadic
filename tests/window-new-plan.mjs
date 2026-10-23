import { connectWindowSession } from "./window-transport.mjs";
import assert from 'node:assert/strict';

export async function verifyWindowNewPlan(api) {
  const initial = await api.createTriadicDatabase(2026), connections = [];
  let holdOpen = null;
  const hub = new api.WindowSessionHub(recovery => {
    const session = new api.PlanSession(recovery), open = session.open.bind(session);
    session.open = async plan => { await holdOpen?.(); await open(plan); };
    return session;
  });
  function client() {
    const connection = connectWindowSession(api, hub);
    connections.push(connection); return connection.session;
  }
  function file() {
    let stored = initial.slice();
    const result = { writes: 0, fail: false, beforeWrite: async () => {}, get bytes() { return stored; } };
    result.handle = { name: '保存先.triadic', queryPermission: async () => 'granted', isSameEntry: async other => other === result.handle,
      getFile: async () => new File([stored], result.handle.name), createWritable: async () => { let next; return {
        write: async value => { await result.beforeWrite(); if (result.fail) throw new Error('確認用の書込失敗'); next = new Uint8Array(value).slice(); },
        close: async () => { stored = next; result.writes++; }, abort: async () => {},
      }; },
    };
    return result;
  }
  const open = (session, target) => session.open({ name: target.handle.name, handle: target.handle, bytes: target.bytes });
  const gate = () => {
    let release, entered;
    const waiting = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
    return { release, started, wait: async () => { entered(); await waiting; } };
  };
  const gates = [];
  try {
    const a = client(), b = client(), target = file();
    await open(a, target);
    for (const year of [2026, 2027]) await assert.rejects(b.create(target.handle, year), /別のウィンドウで使用/);
    assert.equal(target.writes, 0); assert.deepEqual(target.bytes, initial);
    assert.equal(a.getSnapshot().contents.fiscalYear, 2026); assert.equal(b.getSnapshot().contents, null);

    const loading = file(), c = client(), d = client(), loadingGate = gate(); gates.push(loadingGate);
    holdOpen = loadingGate.wait;
    const opening = open(c, loading); await loadingGate.started;
    await assert.rejects(d.create(loading.handle, 2027), /別のウィンドウで使用/);
    assert.equal(loading.writes, 0); loadingGate.release(); await opening; holdOpen = null;

    const reserved = file(), e = client(), f = client(), g = client(), writeGate = gate(); gates.push(writeGate);
    reserved.beforeWrite = writeGate.wait;
    const creating = e.create(reserved.handle, 2027); await writeGate.started;
    await assert.rejects(f.create(reserved.handle, 2028), /別のウィンドウで使用/);
    let joined = false;
    const joining = open(g, reserved).then(() => { joined = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(joined, false, '新規作成予約中の読込は確定を待つ');
    writeGate.release(); await creating; await joining;
    for (const session of [e, g]) assert.equal(session.getSnapshot().contents.fiscalYear, 2027);
    assert.equal(e.getWindowSnapshot().group, g.getWindowSnapshot().group);
    assert.equal((await api.readPlanContents(reserved.bytes)).fiscalYear, 2027);
    assert.equal(reserved.writes, 1);

    const savingTarget = file(), saveGate = gate(); gates.push(saveGate);
    const originalControl = a.control.bind(a);
    a.control = async (action, detail) => { if (action === 'flush') await saveGate.wait(); return originalControl(action, detail); };
    const saving = a.saveAs(async () => savingTarget.handle); await saveGate.started;
    await assert.rejects(b.create(savingTarget.handle, 2027), /別のウィンドウで使用/);
    assert.equal(savingTarget.writes, 0); saveGate.release(); await saving; a.control = originalControl;

    const failed = file(), h = client(); failed.fail = true;
    await assert.rejects(h.create(failed.handle, 2027), /書込失敗/);
    assert.deepEqual(failed.bytes, initial); assert.equal(h.getSnapshot().contents, null);
    assert.equal(hub.saveTargets.size, 0, '失敗時も予約を解放する');
    failed.fail = false;
    await h.create(failed.handle, 2027);
    assert.equal(h.getSnapshot().contents.fiscalYear, 2027, '未使用の既存ファイルは明示置換できる');
    assert.equal((await api.readPlanContents(failed.bytes)).fiscalYear, 2027);
    await assert.rejects(h.create(file().handle, 2028), /現在のファイルを閉じ/);
    assert.equal(hub.saveTargets.size, 0);
    console.log('PASS: 新規作成の使用中・読込中・別名保存/新規作成予約中の保存先を保護、待機読込・失敗・再試行・未使用ファイル置換を検証');
  } finally { gates.forEach(item => item.release()); connections.forEach(connection => connection.dispose()); }
}
