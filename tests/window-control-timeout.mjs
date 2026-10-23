import assert from "node:assert/strict";

export async function verifyWindowControlTimeout(api, bytes) {
  function file() {
    let stored = bytes.slice();
    const result = { get bytes() { return stored; } };
    result.handle = { name: "応答確認.triadic", isSameEntry: async other => other === result.handle,
      queryPermission: async () => "granted", getFile: async () => new File([stored], "応答確認.triadic"),
      createWritable: async () => { let next; return { write: async value => { next = new Uint8Array(value).slice(); }, close: async () => { stored = next; }, abort: async () => {} }; },
    };
    return result;
  }
  function client(hub) {
    let sequence = 0;
    const pending = new Map(), held = [], calls = [];
    const peer = { hold: new Set(), draft: true, discarded: false, closed: false, resumed: 0, latest: null };
    const connection = hub.connect({ postMessage(message) {
      if (message.type === "state") peer.latest = message.contentsPatch ? { ...message, snapshot: { ...message.snapshot, contents: api.applyPlanContentsPatch(peer.latest?.snapshot.contents, message.contentsPatch) } } : message.preserveContents ? { ...message, snapshot: { ...message.snapshot, contents: peer.latest?.snapshot.contents ?? null } } : message;
      if (message.type === "result") {
        const request = pending.get(message.id); pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error)); else request.resolve(message.value);
      }
      if (message.type === "history-decision" && peer.prepared?.transaction === message.transaction) {
        const prepared = peer.prepared; peer.prepared = null;
        if (message.commit) {
          if (prepared.discard) { peer.discarded = true; peer.draft = false; }
          if (prepared.close) peer.closed = true;
        }
      }
      if (message.type === "control" || message.type === "saved") {
        calls.push(message);
        const action = message.type === "saved" ? "saved" : message.action;
        if (peer.hold.has(action)) { held.push(message); return; }
        queueMicrotask(() => {
          if (action === "discard" || action === "close") {
            if (peer.prepared?.transaction !== message.detail) peer.prepared = { transaction: message.detail };
            peer.prepared[action] = true;
          }
          if (action === "resume") peer.resumed++;
          connection.receive({ type: "reply", id: message.id, value: action === "draft" ? peer.draft : action === "confirm-discard" ? true : undefined });
        });
      }
    } });
    peer.request = (method, ...args) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); connection.receive({ type: "request", id, method, args });
    });
    peer.releaseLateReplies = () => { for (const message of held.splice(0)) connection.receive({ type: "reply", id: message.id, value: false }); peer.hold.clear(); };
    peer.calls = calls; peer.disconnect = connection.disconnect;
    return peer;
  }
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("応答待ちが有限時間で終わりません")), 1000); })]).finally(() => clearTimeout(timer));
  };
  for (const phase of ["flush", "draft"]) for (const method of ["history", "travelOperation", "saveAs"]) {
    const hub = new api.WindowSessionHub(undefined, 25), source = file(), healthy = client(hub), frozen = client(hub);
    try {
      await healthy.request("open", { name: source.handle.name, handle: source.handle, bytes });
      await frozen.request("open", { name: source.handle.name, handle: source.handle, bytes });
      await frozen.request("label", "施策入力");
      frozen.hold.add(phase); frozen.hold.add("resume");
      healthy.draft = false;
      const contents = healthy.latest.snapshot.contents;
      await assert.rejects(within(healthy.request(method, method === "travelOperation" ? -1 : source.handle)), /ウィンドウ2 · 施策入力.*応答.*入力は保持/);
      assert.deepEqual(source.bytes, bytes, "応答不能ならファイルを書き換えない");
      assert.equal(frozen.discarded, false); assert.equal(frozen.closed, false); assert.equal(frozen.draft, true);
      assert.deepEqual(healthy.latest.snapshot.contents, contents);
      assert.ok(healthy.resumed > 0, "正常な画面の操作を解除する");
      frozen.releaseLateReplies();
      await within(healthy.request("history"));
      assert.equal(frozen.discarded, true, "再試行で確認した場合だけ破棄する");
      assert.equal(frozen.closed, true);
    } finally { healthy.disconnect(); frozen.disconnect(); }
  }
  // A missing resume acknowledgement cannot delay an otherwise completed action.
  {
    const hub = new api.WindowSessionHub(undefined, 10000), source = file(), a = client(hub), b = client(hub);
    try {
      await a.request("open", { name: source.handle.name, handle: source.handle, bytes });
      await b.request("open", { name: source.handle.name, handle: source.handle, bytes });
      a.draft = false; b.draft = false; a.hold.add("resume");
      const started = performance.now();
      await within(a.request("history"));
      assert.ok(performance.now() - started < 1000);
    } finally { a.disconnect(); b.disconnect(); }
  }
  // A committed save survives a missing acknowledgement of the recent-file reference.
  {
    const hub = new api.WindowSessionHub(undefined, 25), source = file(), a = client(hub);
    try {
      await a.request("open", { name: source.handle.name, handle: source.handle, bytes });
      const id = a.latest.snapshot.contents.departments[0].id;
      a.hold.add("saved");
      await within(a.request("dispatch", { type: "department", change: { type: "update", id, departmentName: "確定済みの保存" } }));
      assert.equal((await api.readPlanContents(source.bytes)).departments[0].departmentName, "確定済みの保存");
      a.releaseLateReplies();
      await within(a.request("prepareSave"));
    } finally { a.disconnect(); }
  }
  // Waiting for a deliberate user decision has no transport deadline.
  {
    const hub = new api.WindowSessionHub(undefined, 25), source = file(), a = client(hub);
    try {
      await a.request("open", { name: source.handle.name, handle: source.handle, bytes });
      a.hold.add("confirm-discard");
      const request = a.request("history");
      const checked = assert.rejects(request, /キャンセル/);
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(a.discarded, false); assert.equal(a.closed, false);
      a.releaseLateReplies(); await checked;
    } finally { a.disconnect(); }
  }
  // The browser-facing boundary rejects expired destructive commands before touching input.
  const session = new api.WindowPlanSession(), replies = [];
  let discarded = false, closed = false;
  session.registerControls({ draft: () => true, discard: () => { discarded = true; }, close: () => { closed = true; }, confirmDiscard: async () => true });
  session.port = { postMessage: value => replies.push(value) };
  for (const action of ["flush", "discard", "close"]) await session.receive({ type: "control", id: replies.length + 1, action, expiresAt: Date.now() - 1 });
  assert.equal(discarded, false); assert.equal(closed, false);
  assert.ok(replies.every(reply => /期限/.test(reply.error)));
  assert.equal(session.getWindowSnapshot().settling, false);
  const failed = new api.WindowPlanSession();
  const contents = { marker: '保存済み内容' };
  failed.snapshot = { ...failed.getSnapshot(), contents, busy: true };
  failed.info = { ...failed.getWindowSnapshot(), settling: true };
  let rejected;
  failed.pending.set(1, { resolve: () => assert.fail('故障後に成功しない'), reject: error => { rejected = error; } });
  failed.failWorker();
  assert.match(rejected.message,/入力を控えてからページを再読み込み/);
  assert.equal(failed.getSnapshot().busy,false,'Worker故障で処理中表示を解除する');
  assert.equal(failed.getWindowSnapshot().settling,false);
  assert.equal(failed.getSnapshot().contents,contents,'保存済みの表示内容は保持');
  assert.equal(failed.pending.size,0);
  await failed.receive({ type: 'state', snapshot: { ...failed.getSnapshot(), busy: true, historyError: '' }, info: failed.getWindowSnapshot() });
  assert.equal(failed.getSnapshot().busy,false,'故障後の遅れた通知で処理中に戻さない');
  console.log("PASS: flush・draft・resumeの未応答、保存・取消・履歴の有限中止、遅延返信、入力とファイル保持、再試行、期限切れ要求の拒否");
}
