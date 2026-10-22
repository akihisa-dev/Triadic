import assert from "node:assert/strict";
import { verifyWindowSaveAs } from "./window-save-as.mjs";

export async function verifySaveAs(api) {
  const initial = await api.createTriadicDatabase(2026);
  await verifyWindowSaveAs(api, initial);
  const file = (name, bytes = new Uint8Array()) => {
    let stored = bytes, fail = "", locked = false, changed = false;
    const handle = { name, isSameEntry: async other => other === handle,
      requestPermission: async () => fail === "permission" ? "denied" : "granted",
      getFile: async () => new File([stored], name),
      async createWritable() {
        assert.equal(locked, false); locked = true;
        if (changed) stored = new Uint8Array([8, 9]);
        let pending;
        return { async write(value) { if (fail === "write") throw new Error("書込失敗"); pending = new Uint8Array(value); },
          async close() { if (fail === "close") throw new Error("確定失敗"); stored = pending; locked = false; },
          async abort() { locked = false; } };
      } };
    return { handle, get bytes() { return stored; }, fail(value) { fail = value; }, race() { changed = true; } };
  };
  const source = file("元.triadic", initial), copy = file("別名.triadic");
  const session = new api.PlanSession();
  await session.open({ name: source.handle.name, bytes: initial, handle: source.handle });
  await session.dispatch({ type: "settings", change: { type: "selection", screen: "cost-table", selected: [1, 2] } }, async () => source.handle);
  const sourceBefore = source.bytes.slice(), before = session.getSnapshot();
  const notifications = [];
  session.subscribeFileSave(async handle => { notifications.push(handle); });
  for (const reason of ["cancel", "same", "extension", "permission", "write", "close", "race"]) {
    const target = file(reason === "extension" ? "誤り.txt" : `${reason}.triadic`);
    if (["permission", "write", "close"].includes(reason)) target.fail(reason);
    if (reason === "race") target.race();
    await assert.rejects(session.saveAs(async () => {
      if (reason === "cancel") throw new DOMException("取消", "AbortError");
      return reason === "same" ? source.handle : target.handle;
    }));
    assert.equal(session.getHandle(), source.handle, reason);
    assert.deepEqual(session.getSnapshot().contents, before.contents);
    assert.deepEqual(session.getSnapshot().history, before.history);
    assert.equal(session.getSnapshot().canUndo, true);
    assert.deepEqual(source.bytes, sourceBefore);
    assert.equal(notifications.length, 0);
    if (!["race", "same"].includes(reason)) assert.deepEqual(target.bytes, new Uint8Array());
  }
  let finish;
  const saving = session.saveAs(() => new Promise(resolve => { finish = resolve; }));
  assert.equal(session.getSnapshot().busy, true, "選択画面を開く直後から処理を予約する");
  let called = false;
  await assert.rejects(session.saveAs(async () => { called = true; return copy.handle; }), /処理/);
  assert.equal(called, false);
  finish(copy.handle);
  await saving;
  assert.equal(session.getHandle(), copy.handle);
  assert.equal(session.getSnapshot().name, copy.handle.name);
  assert.equal(session.getSnapshot().canUndo, true, "別名保存は操作取消を維持する");
  assert.equal(session.getSnapshot().history.dirtySince, null);
  assert.ok(session.getSnapshot().history.entries.length >= before.history.entries.length);
  assert.deepEqual(source.bytes, sourceBefore, "履歴の確定も元へ書かない");
  assert.deepEqual(notifications, [copy.handle]);
  assert.deepEqual((await api.readPlanContents(copy.bytes)).kindSelections["cost-table"], [1, 2]);
  await session.travelOperation(-1, async () => copy.handle);
  assert.deepEqual((await api.readPlanContents(copy.bytes)).kindSelections["cost-table"], [1]);
  assert.deepEqual(source.bytes, sourceBefore, "操作取消も新しい保存先だけを更新する");
  await session.travelOperation(1, async () => copy.handle);
  assert.deepEqual((await api.readPlanContents(copy.bytes)).kindSelections["cost-table"], [1, 2]);
  const reopened = new api.PlanSession();
  await reopened.open({ name: copy.handle.name, handle: copy.handle, bytes: copy.bytes });
  assert.deepEqual(reopened.getSnapshot().contents, session.getSnapshot().contents);
  console.log("別名保存: 保存先切替・取消/やり直し・履歴・再読込・キャンセル・同一ファイル・許可拒否・書込/確定失敗・保存先更新・同時操作・元ファイル保護を確認しました。");
}
