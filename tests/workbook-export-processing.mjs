import assert from 'node:assert/strict';
export async function verifyWorkbookExportProcessing(api) {
  const original = globalThis.Worker, workers = [];
  class FakeWorker {
    terminated = false; request = null;
    constructor() { workers.push(this); }
    postMessage(request) { this.request = request; }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = FakeWorker;
  try {
    const preCancelled = new AbortController(); preCancelled.abort();
    await assert.rejects(api.processWorkbookExport({ type: 'report' }, preCancelled.signal), { name: 'AbortError' });
    assert.equal(workers.length, 0);
    const controller = new AbortController();
    const cancelled = api.processWorkbookExport({ type: 'report' }, controller.signal);
    const rejected = assert.rejects(cancelled, { name: 'AbortError' });
    controller.abort(); await rejected;
    assert.equal(workers[0].terminated, true);
    workers[0].onmessage({ data: { bytes: new Uint8Array([9]) } });
    const next = api.processWorkbookExport({ type: 'previous' }, new AbortController().signal);
    workers[1].onmessage({ data: { bytes: new Uint8Array([1,2,3]) } });
    assert.deepEqual(await next, new Uint8Array([1,2,3]));
    assert.equal(workers[1].terminated, true);
    const error = api.processWorkbookExport({ type: 'report' }, new AbortController().signal);
    const failed = assert.rejects(error, /もう一度出力/); workers[2].onerror(); await failed;
    assert.equal(workers[2].terminated, true);
    const invalid = api.processWorkbookExport({ type: 'report' }, new AbortController().signal);
    const refused = assert.rejects(invalid, /出力できません/);
    workers[3].onmessage({ data: { error: '' } }); await refused;
    assert.equal(workers[3].terminated, true);
  } finally { globalThis.Worker = original; }
  console.log('PASS: 出力専用Workerの事前取消・実行中取消・遅延返信無視・再出力・故障と解放');
}
