import assert from "node:assert/strict";

export async function verifyWindowTransfer(api) {
  const bytes = await api.createSamplePlan(2026), hub = new api.WindowSessionHub(), clients = [];
  let stored = bytes.slice(), fail = false;
  const handle = { name: "通信確認.triadic", isSameEntry: async other => other === handle, queryPermission: async () => "granted",
    getFile: async () => new File([stored], "通信確認.triadic"), createWritable: async () => { let next; return {
      write: async value => { if (fail) throw new Error("確認用の保存失敗"); next = new Uint8Array(value).slice(); },
      close: async () => { stored = next; }, abort: async () => {},
    }; } };
  function client() {
    const session = new api.WindowPlanSession(), sent = [], received = [];
    session.started = Promise.resolve();
    const connection = hub.connect({ postMessage(message) {
      received.push(message);
      const copied = message.type === "state" ? { ...message, snapshot: structuredClone(message.snapshot), info: structuredClone(message.info), ...(message.contentsPatch ? { contentsPatch: structuredClone(message.contentsPatch) } : {}) }
        : message.type === "result" ? structuredClone(message) : message;
      queueMicrotask(() => { void session.receive(copied); });
    } });
    session.port = { postMessage(message) {
      sent.push(message);
      const copied = message.type === "request" && message.method === "dispatch" ? structuredClone(message) : message;
      queueMicrotask(() => connection.receive(copied));
    } };
    session.registerControls({ draft: () => false, discard() {}, close() {}, confirmDiscard: async () => true });
    const item = { session, sent, received, disconnect: connection.disconnect }; clients.push(item); return item;
  }
  const a = client(), b = client(), size = value => Buffer.byteLength(JSON.stringify(value));
  const contents = () => a.session.getSnapshot().contents;
  const draftOf = item => ({ name: item.name, note: item.note, fiscalYear: String(item.fiscalYear), expansionId: item.expansionId,
    expansionCategoryId: item.expansionCategoryId, industryId: item.industryId, departmentId: item.departmentId, periodTypeId: item.periodTypeId, rows: structuredClone(item.rows) });
  const measurements = [];
  async function edit(command, label) {
    const stateStart = a.received.length;
    const result = await a.session.dispatch(command);
    assert.deepEqual(result, contents()); assert.deepEqual(result, b.session.getSnapshot().contents);
    const request = a.sent.findLast(message => message.type === "request" && message.method === "dispatch");
    const reply = a.received.findLast(message => message.type === "result" && message.id === request.id);
    assert.ok(reply.contentsPatch); assert.equal(reply.value, undefined);
    assert.ok(size(request) < size(contents()) / 2, `${label}: 無関係な全計画を送らない`);
    assert.ok(size(reply) < 200, `${label}: 先行通知を利用して全量返信しない`);
    const states = a.received.slice(stateStart).filter(message => message.type === "state");
    assert.ok(states.every(message => message.snapshot.contents === null), "保存後は差分または同じ内容の維持通知");
    measurements.push({ label, request: size(request), result: size(reply), states: states.reduce((sum, message) => sum + size(message), 0) });
    return request;
  }
  try {
    for (const peer of [a, b]) await peer.session.open({ name: handle.name, handle, bytes });
    assert.ok(a.received.some(message => message.type === "state" && message.snapshot.contents?.initiatives.length > 1), "初回は全量同期");
    const department = contents().departments[0];
    const departmentRequest = await edit({ type: "department", change: { type: "update", id: department.id, departmentName: "通信確認部署" } }, "部署名");
    assert.deepEqual(Object.keys(departmentRequest.args[1]), ["departments"]);
    const selected = await edit({ type: "settings", change: { type: "selection", screen: "cost-table", selected: [1, 2] } }, "種別選択");
    assert.deepEqual(selected.args[1], {});
    const input = api.createPreviousInput(contents(), department.industryIds[0], department.id, 1);
    input.rows[0].amounts[4] = "987";
    const previous = await edit({ type: "settings", change: { type: "previous", input } }, "前年1セル");
    assert.equal(previous.args[1].initiatives, undefined);
    assert.ok(previous.args[1].previousAmounts.every(item => item.industryId === input.industryId && item.departmentId === input.departmentId && item.previousKind === input.previousKind));
    const initiative = contents().initiatives[0], draft = draftOf(initiative);
    draft.rows[0].amounts[4] = "123";
    const initiativeRequest = await edit({ type: "initiative.update", id: initiative.id, draft }, "施策1セル");
    assert.deepEqual(initiativeRequest.args[1].initiatives.map(item => item.id), [initiative.id]);
    assert.equal(initiativeRequest.args[1].previousAmounts, undefined);

    // Capture a stale base before activation waits, then preserve another window's changed field.
    let release;
    a.session.activation = new Promise(resolve => { release = resolve; });
    const old = draftOf(contents().initiatives[0]);
    const waiting = a.session.dispatch({ type: "initiative.update", id: initiative.id, draft: { ...old, name: "待機中の名前" } });
    await b.session.dispatch({ type: "initiative.update", id: initiative.id, draft: { ...old, note: "別画面の備考" } });
    release(); await waiting;
    assert.equal(contents().initiatives[0].name, "待機中の名前"); assert.equal(contents().initiatives[0].note, "別画面の備考");
    const real = contents();
    a.session.snapshot = { ...a.session.snapshot, contents: structuredClone(real) };
    a.session.snapshot.contents.initiatives[0].identity = "異なる個体";
    await assert.rejects(a.session.dispatch({ type: "initiative.update", id: initiative.id, draft: old }), /対象の施策が変更/);
    a.session.snapshot = { ...a.session.snapshot, contents: real };
    fail = true;
    const savedBefore = stored.slice();
    const retry = { type: "department", change: { type: "update", id: department.id, departmentName: "再試行で保存" } };
    await assert.rejects(a.session.dispatch(retry), /確認用の保存失敗/);
    assert.deepEqual(stored, savedBefore); fail = false;
    await edit(retry, "再試行");

    // Hold only the first result after its state publication; a second result must not change it.
    const originalRequest = hub.request.bind(hub);
    let entered, finish, once = true, operationResult;
    const enteredPromise = new Promise(resolve => { entered = resolve; }), finishPromise = new Promise(resolve => { finish = resolve; });
    hub.request = async (...args) => {
      const hold = args[1] === "dispatch" && once;
      if (hold) once = false;
      const result = await originalRequest(...args);
      if (hold) { operationResult = structuredClone(result); entered(); await finishPromise; }
      return result;
    };
    const first = a.session.dispatch({ type: "settings", change: { type: "selection", screen: "cost-table", selected: [2] } });
    await enteredPromise;
    await b.session.dispatch({ type: "settings", change: { type: "selection", screen: "cost-table", selected: [1] } });
    finish(); assert.deepEqual(await first, operationResult, "返信前に新しい状態が届いても操作の返り値を正確に復元");
    assert.deepEqual(contents().kindSelections["cost-table"], [1], "結果復元で共有状態を巻き戻さない");
    console.log("PASS: 要求/結果/stateの内容量、初回同期、更新順序、同時編集、同一性、保存失敗と再試行", measurements);
  } finally { for (const peer of clients) peer.disconnect(); }
}
