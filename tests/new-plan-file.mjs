import assert from "node:assert/strict";
import { verifyWindowNewPlan } from "./window-new-plan.mjs";

export async function verifyNewPlanFile(api) {
  await verifyWindowNewPlan(api);
  for (const initial of [new Uint8Array(), new Uint8Array([1, 2, 3])]) {
    let stored = initial.slice();
    let locked = false, reads = 0, writes = 0, aborted = 0;
    const handle = {
      name: "新規.triadic",
      async getFile() {
        assert.equal(locked, ++reads > 1, "初期化前に基準を取得し、書込ロック内で最新内容を照合する");
        return new File([stored], this.name);
      },
      async createWritable(options) {
        assert.equal(options.mode, "exclusive"); locked = true;
        let pending;
        return {
          async write(data) { writes++; pending = new Uint8Array(data); },
          async close() { stored = pending; locked = false; },
          async abort() { aborted++; locked = false; },
        };
      },
    };
    await api.createNewPlanFile(handle, 2026);
    assert.equal((await api.readPlanContents(stored)).fiscalYear, 2026);
    assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(aborted, 0);
    const replacement = new Uint8Array([4, 5, 6]);
    const writer = handle.createWritable.bind(handle);
    reads = 0; writes = 0;
    handle.createWritable = async options => { stored = replacement.slice(); return writer(options); };
    await assert.rejects(api.createNewPlanFile(handle, 2026), /更新されたため.*別の保存先/);
    assert.deepEqual(stored, replacement); assert.equal(writes, 0); assert.equal(aborted, 1);
  }
  for (const failure of ["read", "initialize", "lock", "check", "write", "close"]) {
    const original = new Uint8Array([1, 2, 3]);
    let stored = original.slice(), reads = 0, writers = 0, aborted = false;
    const handle = {
      name: "保存先.triadic",
      async getFile() {
        if (++reads === (failure === "check" ? 2 : 1) && ["read", "check"].includes(failure)) throw new Error("読取失敗");
        return new File([stored], this.name);
      },
      async createWritable() {
        writers++;
        if (failure === "lock") throw new DOMException("locked", "NoModificationAllowedError");
        let pending;
        return {
          async write(data) { if (failure === "write") throw new Error("書込失敗"); pending = new Uint8Array(data); },
          async close() { if (failure === "close") throw new Error("確定失敗"); stored = pending; },
          async abort() { aborted = true; },
        };
      },
    };
    await assert.rejects(api.createNewPlanFile(handle, failure === "initialize" ? 0 : 2026));
    assert.deepEqual(stored, original, failure);
    assert.equal(writers, ["read", "initialize"].includes(failure) ? 0 : 1);
    assert.equal(aborted, ["check", "write", "close"].includes(failure));
  }
  console.log("PASS: 新規作成の空ファイル・明示置換、初期化中の更新検出、読取・初期化・排他・書込・確定失敗で元データ保護");
}
