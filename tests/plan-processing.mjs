import assert from 'node:assert/strict';

export async function verifyPlanProcessing(api) {
  const original = globalThis.Worker, workers = [];
  class FakeWorker {
    requests = []; terminated = false;
    constructor() { workers.push(this); }
    postMessage(message) { this.requests.push(message); }
    terminate() { this.terminated = true; }
    reply(value) { const request = this.requests.shift(); this.onmessage({ data: { id: request.id, value } }); }
  }
  globalThis.Worker = FakeWorker;
  const a = new Uint8Array([1]), b = new Uint8Array([2]);
  const releaseA = api.bindPlanProcessing(a), releaseB = api.bindPlanProcessing(b);
  try {
    let finishedA = false;
    const delayed = api.processPlan('readHistorySnapshot', a, 1).then(value => { finishedA = true; return value; });
    const quick = api.processPlan('readHistorySnapshot', b, 1);
    assert.equal(workers.length, 2);
    workers[1].reply(new Uint8Array([3]));
    const savedB = await quick;
    assert.equal(finishedA, false, '別ファイルBは遅いAの完了を待たない');
    const savedA = new Uint8Array([4]); workers[0].reply(savedA);
    assert.equal(await delayed, savedA);
    const followA = api.processPlan('readDataHistory', savedA);
    const followB = api.processPlan('readDataHistory', savedB);
    assert.equal(workers.length, 2, '保存・履歴の返却bytesも元のファイルの担当へ戻る');
    const rejected = assert.rejects(followA, /入力は保持/);
    workers[0].onerror(); await rejected;
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[1].terminated, false, '一つのWorkerの故障で別ファイルを中止しない');
    workers[1].reply({ entries: [] }); await followB;
    const retry = api.processPlan('readDataHistory', savedA);
    assert.equal(workers.length, 3, '故障した担当だけを再作成');
    workers[2].reply({ entries: [] }); await retry;
    const operation = api.processPlan('prepareKindSelectionSave', savedA, 'cost', [1]);
    const before = new Uint8Array([5]), after = new Uint8Array([6]);
    workers[2].reply({ bytes: new Uint8Array([7]), operation: { before, after } });
    await operation;
    const snapshot = api.processPlan('readSnapshotContents', before);
    assert.equal(workers.length, 3, '操作取消用のスナップショットも同じ担当を使う');
    workers[2].reply({}); await snapshot;
    releaseA(); assert.equal(workers[2].terminated, true);
    assert.equal(workers[1].terminated, false);
    const pendingB = api.processPlan('readDataHistory', savedB);
    const cancelled = assert.rejects(pendingB, /入力は保持/);
    releaseB(); await cancelled;
    assert.equal(workers[1].terminated, true, '最後の利用終了時に待機とWorkerを解放');
  } finally { releaseA(); releaseB(); globalThis.Worker = original; }
  console.log('PASS: ファイル別Worker、遅延の独立、保存・取消bytesの所属維持、故障分離・再試行・解放');
}
