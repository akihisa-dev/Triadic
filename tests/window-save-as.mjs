import { connectWindowSession } from "./window-transport.mjs";
import assert from "node:assert/strict";

export async function verifyWindowSaveAs(api, bytes) {
  const hub = new api.WindowSessionHub(), connections = [];
  function windowSession() {
    const connection = connectWindowSession(api, hub);
    connections.push(connection); return connection.session;
  }
  function file(name, initial) {
    let stored = initial.slice();
    const result = { reads: 0, writes: 0, fail: false, get bytes() { return stored; }, replace(value) { stored = value.slice(); } };
    result.handle = { name, isSameEntry: async other => other === result.handle, queryPermission: async () => "granted",
      getFile: async () => { result.reads++; return new File([stored], name); },
      createWritable: async () => { let next; return {
        write: async value => { if (result.fail) throw new Error("確認用の保存失敗"); next = new Uint8Array(value).slice(); },
        close: async () => { result.writes++; stored = next; }, abort: async () => {},
      }; },
    };
    return result;
  }
  const source = file("元.triadic", bytes), target = file("別名.triadic", bytes);
  const a = windowSession(), b = windowSession();
  let release;
  try {
    await a.open({ name: source.handle.name, handle: source.handle, bytes });
    await b.open({ name: source.handle.name, handle: source.handle, bytes });
    await a.dispatch({ type: "settings", change: { type: "selection", screen: "cost-table", selected: [1, 2] } });
    const before = a.getSnapshot(), sourceBefore = source.bytes.slice();
    const originalControl = b.control.bind(b);
    let started;
    const began = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
    b.control = async (action, detail) => { if (action === "flush") { started(); await gate; } return originalControl(action, detail); };
    const saving = a.saveAs(async () => target.handle);
    const rejected = assert.rejects(saving, /保存先のファイルが更新/);
    await began;
    assert.equal(target.reads, 1, "共有側の入力確定を待つ前に選択先の基準を取得");
    const external = await api.saveKindSelection(bytes, "cost-table", [2]);
    target.replace(external); release(); await rejected;
    assert.equal(target.writes, 0); assert.deepEqual(target.bytes, external);
    assert.deepEqual(source.bytes, sourceBefore);
    for (const client of [a, b]) {
      assert.equal(client.getHandle(), source.handle);
      assert.deepEqual(client.getSnapshot().contents, before.contents);
      assert.deepEqual(client.getSnapshot().history, before.history);
      assert.equal(client.getSnapshot().canUndo, true);
      assert.equal(client.getWindowSnapshot().settling, false);
    }
    b.control = originalControl;
    const writes = target.writes;
    await assert.rejects(a.saveAs(async () => { throw new DOMException("取消", "AbortError"); }), { name: "AbortError" });
    assert.equal(target.writes, writes);
    target.fail = true;
    await assert.rejects(a.saveAs(async () => target.handle), /確認用の保存失敗/);
    assert.equal(a.getHandle(), source.handle); assert.deepEqual(target.bytes, external);
    assert.equal(hub.saveTargets.size, 0);
    target.fail = false;
    const saved = await a.saveAs(async () => target.handle);
    assert.deepEqual(saved, a.getSnapshot().contents);
    for (const client of [a, b]) assert.equal(client.getHandle(), target.handle);
    assert.deepEqual((await api.readPlanContents(target.bytes)).kindSelections["cost-table"], [1, 2]);
    assert.deepEqual(source.bytes, sourceBefore);
    await b.travelOperation(-1);
    assert.deepEqual((await api.readPlanContents(target.bytes)).kindSelections["cost-table"], [1]);
    console.log("PASS: WindowPlanSession→Hubの別名保存で選択直後の基準、待機中の外部更新拒否、取消・失敗・再試行・共有取消を検証");
  } finally { release?.(); for (const connection of connections) connection.dispose(); }
}
