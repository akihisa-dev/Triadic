import { verifyOperationMembership } from "./window-operation-membership.mjs";
import { verifyPlanContentsPatch } from "./plan-contents-patch.mjs";
import { verifyPlanProcessing } from "./plan-processing.mjs";
import { verifyLatestNavigation } from "./latest-navigation.mjs";
import assert from "node:assert/strict";
import { verifyWindowTransfer } from "./window-transfer.mjs";
import { verifyHistoryMembership } from "./window-history-membership.mjs";
import { verifyHistoryCommit } from "./window-history-commit.mjs";
import { verifyWindowControlTimeout } from "./window-control-timeout.mjs";

export async function verifyWindowSession(api) {
  await verifyOperationMembership(api);
  await verifyLatestNavigation(api);
  await verifyPlanProcessing(api);
  const bytes = await api.createTriadicDatabase(2026);
  verifyPlanContentsPatch(api, await api.readPlanContents(bytes));
  const original = file("共有.triadic", bytes);
  const hub = new api.WindowSessionHub();
  const peers = [];
  function peer(hubInstance = hub) {
    let sequence = 0;
    const pending = new Map();
    const client = { states: [], closed: false, hasDraft: false, discard: false, accept: true, flush: async () => {}, recoveryTarget: null, recovered: [] };
    const connection = hubInstance.connect({ postMessage(message) {
      if (message.type === "state") client.states.push(message.contentsPatch ? { ...message, snapshot: { ...message.snapshot, contents: api.applyPlanContentsPatch(client.states.at(-1)?.snapshot.contents, message.contentsPatch) } } : message.preserveContents ? { ...message, snapshot: { ...message.snapshot, contents: client.states.at(-1)?.snapshot.contents ?? null } } : message);
      if (message.type === "result") {
        const request = pending.get(message.id); pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error)); else request.resolve(message.contentsPatch ? api.applyPlanContentsPatch(client.states.at(-1).snapshot.contents, message.contentsPatch) : message.value);
      }
      if (message.type === "history-decision" && client.prepared?.transaction === message.transaction) {
        const prepared = client.prepared; client.prepared = null;
        if (message.commit) {
          if (prepared.discard) { client.hasDraft = false; client.discard = true; }
          if (prepared.close) client.closed = true;
        }
      }
      if (message.type === "saved") queueMicrotask(() => connection.receive({ type: "reply", id: message.id }));
      if (message.type === "control") queueMicrotask(async () => {
        try {
          let value;
          if (message.action === "flush") await client.flush();
          if (message.action === "recover") { client.recovered.push(message.detail); value = await api.captureRecoveryDestination(client.recoveryTarget); }
          if (message.action === "draft") value = client.hasDraft;
          if (message.action === "confirm-discard") value = client.accept;
          if (message.action === "discard" || message.action === "close") {
            if (client.prepared?.transaction !== message.detail) client.prepared = { transaction: message.detail };
            client.prepared[message.action] = true;
          }
          connection.receive({ type: "reply", id: message.id, value });
        } catch (error) { connection.receive({ type: "reply", id: message.id, error: error.message }); }
      });
    } });
    client.request = (method, ...args) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject });
      connection.receive({ type: "request", id, method, args });
    });
    client.disconnect = connection.disconnect;
    client.latest = () => client.states.at(-1);
    peers.push(client); return client;
  }
  const a = peer(), b = peer(), c = peer();
  try {
    await a.request("open", { name: original.handle.name, handle: original.handle, bytes });
    const group = a.latest().info.group;
    const view = { screen: { page: "cost-table", selectedInitiative: null, detailOrigin: "initiative-list" }, costTable: { industries: [1], departments: [1], top: 140, left: 300 }, relation: null, values: {
      "table:kinds": { "initiative-list": [1], "cost-table": [2], "expansion-table": [1, 2] },
      "table:previous": { "cost-table": 2, "expansion-table": 1 },
      "initiative-list:sort": { column: "name", direction: "descending" }, "initiative:kind": 2,
      "previous:kind": 1, "previous:industries": [2, 1], "previous:departments": [1], "home:mode": "process",
    }, scroll: [{ key: "table", top: 140, left: 300 }] };
    const unfinished = { ...view, screen: { ...view.screen, page: "initiative-entry" }, values: { ...view.values,
      "initiative:draft": { name: "未登録の施策" }, "future:draft": "複製しない" } };
    await a.request("reserve", "draft-ticket", unfinished);
    const draftCopy = peer(); await draftCopy.request("join", group, "draft-ticket");
    const cloned = draftCopy.latest().info.initialView;
    assert.equal(cloned.screen.page, "initiative-entry");
    assert.deepEqual(cloned.values, view.values, "表示条件だけを引き継ぐ");
    assert.deepEqual(cloned.scroll, view.scroll, "画面の表示位置を複製する");
    assert.equal(unfinished.values["initiative:draft"].name, "未登録の施策");
    draftCopy.disconnect();
    await a.request("reserve", "ticket", view);
    await b.request("join", group, "ticket");
    assert.deepEqual(b.latest().info.initialView, view, "画面・条件・表示位置を複製する");
    assert.equal(b.latest().info.number, 3);
    await c.request("open", { name: original.handle.name, handle: original.handle, bytes });
    assert.equal(c.latest().info.group, group, "通常の開き直しでも同一ファイルの共有へ参加する");
    const seed = a.latest().snapshot.contents;
    const draft = { ...api.createInitiativeDraft("2026"), name: "切替前の施策", note: "元の備考", expansionId: seed.expansions[0].id,
      departmentId: seed.departments[0].id, industryId: seed.departments[0].industryIds[0],
      rows: [{ id: "window-test-row", accountId: seed.accounts[0].id, amounts: { 4: "10" } }] };
    await a.request("dispatch", { type: "initiative.register", draft });
    const oldView = a.latest().snapshot.contents;
    const initiative = oldView.initiatives[0];
    const edit = { ...draft, rows: initiative.rows };
    await a.request("dispatch", { type: "initiative.update", id: initiative.id, draft: { ...edit, note: "直前のウィンドウで保存" } }, oldView);
    await b.request("dispatch", { type: "initiative.update", id: initiative.id, draft: { ...edit, name: "切替先の入力" } }, oldView);
    assert.equal(a.latest().snapshot.contents.initiatives[0].note, "直前のウィンドウで保存", "旧表示からの全体入力で別項目の先行保存を戻さない");
    assert.equal(a.latest().snapshot.contents.initiatives[0].name, "切替先の入力");
    const differentOwner = structuredClone(oldView);
    differentOwner.initiatives[0].identity = "b".repeat(32);
    await assert.rejects(b.request("dispatch", { type: "initiative.update", id: initiative.id, draft: edit }, differentOwner), /対象の施策が変更/);
    assert.equal(c.latest().snapshot.contents.initiatives[0].name, "切替先の入力", "別個体の旧入力は移さない");
    await a.request("dispatch", { type: "aggregation", change: { type: "add", name: "ウィンドウ用の子集計" } });
    const child = a.latest().snapshot.contents.aggregations.at(-1);
    assert.ok(a.latest().snapshot.contents.accounts.some(item => item.id === child.id));
    await a.request("dispatch", { type: "aggregation", change: { type: "add", name: "ウィンドウ用の親集計" } });
    const parent = a.latest().snapshot.contents.aggregations.at(-1);
    for (const kind of ["account", "group"]) await a.request("dispatch", { type: "aggregation", change: { type: "move", member: { kind, id: child.id }, parentId: parent.id, sign: 1 } });
    const originalMembers = a.latest().snapshot.contents;
    const members = originalMembers.aggregations.find(item => item.id === parent.id).members;
    for (const [client, kind] of [[a, "account"], [b, "group"]]) await client.request("dispatch", { type: "aggregation", change: {
      type: "update", id: parent.id, name: parent.name, members: members.map(item => item.kind === kind ? { ...item, sign: -1 } : item),
    } }, originalMembers);
    assert.ok(c.latest().snapshot.contents.aggregations.find(item => item.id === parent.id).members.every(item => item.sign === -1), "同じ番号の科目と子集計を区別し、別ウィンドウの加減を保持する");
    const initial = a.latest().snapshot.contents.departments[0];
    const update = name => ({ type: "department", change: { type: "update", id: initial.id, departmentName: name } });
    await a.request("dispatch", update("共有の編集"));
    assert.equal(b.latest().snapshot.contents.departments[0].departmentName, "共有の編集");
    await b.request("travelOperation", -1);
    assert.equal(a.latest().snapshot.contents.departments[0].departmentName, initial.departmentName);
    await c.request("travelOperation", 1);
    assert.equal(b.latest().snapshot.contents.departments[0].departmentName, "共有の編集");

    // A global operation must let a pending UI save enter the document queue before undoing it.
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    a.flush = async () => { await wait; a.flush = async () => {}; await a.request("dispatch", update("入力停止を待たず保存")); };
    let completed = false;
    const undo = b.request("travelOperation", -1).then(() => { completed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false, "保存待ちは内部で待つ");
    release(); await undo;
    assert.equal(c.latest().snapshot.contents.departments[0].departmentName, "共有の編集");

    const copy = file("共有のコピー.triadic", new Uint8Array());
    const other = file('別ファイル.triadic', bytes), owner = peer();
    await owner.request('open', { name: other.handle.name, handle: other.handle, bytes });
    const sourceBefore = original.bytes.slice(), destinationBefore = other.bytes.slice();
    a.hasDraft = true; owner.hasDraft = true;
    await assert.rejects(b.request('saveAs', other.handle), /別のウィンドウで使用/);
    assert.deepEqual(original.bytes, sourceBefore); assert.deepEqual(other.bytes, destinationBefore);
    assert.equal(a.hasDraft, true); assert.equal(owner.hasDraft, true);
    a.hasDraft = false; owner.hasDraft = false;
    let releaseCopy;
    const heldCopy = new Promise(resolve => { releaseCopy = resolve; });
    a.flush = async () => heldCopy;
    const copying = b.request('saveAs', copy.handle);
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(owner.request('saveAs', copy.handle), /別のウィンドウで使用/);
    const joining = peer(); let joined = false;
    const openCopy = joining.request('open', { name: copy.handle.name, handle: copy.handle, bytes: new Uint8Array() }).then(() => { joined = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(joined, false, '保存先の書き込み中は同じファイルの新しい担当を作らない');
    releaseCopy(); await copying; await openCopy; a.flush = async () => {};
    assert.equal(joining.latest().info.group, a.latest().info.group);
    assert.equal(joining.latest().snapshot.name, copy.handle.name);
    joining.disconnect(); owner.disconnect();
    for (const item of [a, b, c]) assert.equal(item.latest().snapshot.name, copy.handle.name);
    await c.request("dispatch", update("コピー先の編集"));
    assert.equal((await api.readPlanContents(original.bytes)).departments[0].departmentName, "共有の編集");
    assert.equal((await api.readPlanContents(copy.bytes)).departments[0].departmentName, "コピー先の編集");

    a.hasDraft = true; b.accept = false;
    await assert.rejects(b.request("history"), /キャンセル/);
    assert.equal(a.hasDraft, true); assert.equal(c.closed, false);
    b.accept = true; copy.fail = true;
    await assert.rejects(b.request("history"), /確認用の保存失敗/);
    assert.equal(a.hasDraft, true, "履歴の保存失敗では未登録入力を破棄しない");
    assert.equal(c.closed, false, "失敗では他のウィンドウを閉じない");
    copy.fail = false;
    await b.request("history");
    assert.equal(a.discard, true); assert.equal(a.closed, true); assert.equal(c.closed, true);
    await assert.rejects(b.request("reserve", "blocked", view), /履歴/);
    await b.request("leave-history");
    await b.request("reserve", "resumed", view);
    const d = peer(); await d.request("join", group, "resumed");
    assert.equal(d.latest().info.number, joining.latest().info.number + 1, "番号を使い回さない");
    b.hasDraft = true;
    await d.request("close");
    assert.equal(b.latest().snapshot.contents.departments[0].departmentName, "コピー先の編集", "他の入力やファイルを閉じない");
    assert.equal(b.closed, false);
    await d.request("open", { name: original.handle.name, handle: original.handle, bytes: original.bytes });
    assert.ok(d.latest().snapshot.contents, "閉じた画面で別ファイルを開くと初回の全量を受け取る");
    console.log("PASS: 同一ファイルの共有・表示複製・共有取消・保存待ち・全保存先切替・履歴集約・失敗保護・個別終了");
  } finally { for (const item of peers) item.disconnect(); }

  // A blocked filesystem write must not reserve the hub for an unrelated file.
  const slowFile = file("独立.triadic", bytes), fastFile = file("独立.triadic", bytes);
  const slow = peer(), fast = peer(), same = peer();
  let releaseWrite;
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  let writing;
  const writeStarted = new Promise(resolve => { writing = resolve; });
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("別ファイルが停止中の処理を待っています")), 5000); })]).finally(() => clearTimeout(timer));
  };
  let slowSave, sameSave;
  try {
    await slow.request("open", { name: slowFile.handle.name, handle: slowFile.handle, bytes });
    await same.request("open", { name: slowFile.handle.name, handle: slowFile.handle, bytes });
    slowFile.gate = async () => { writing(); await writeGate; };
    const id = slow.latest().snapshot.contents.departments[0].id;
    const update = name => ({ type: "department", change: { type: "update", id, departmentName: name } });
    slowSave = slow.request("dispatch", update("遅い保存"));
    await writeStarted;
    let sameComplete = false;
    sameSave = same.request("dispatch", update("同じファイルの次の保存")).then(() => { sameComplete = true; });
    await within(fast.request("open", { name: fastFile.handle.name, handle: fastFile.handle, bytes }));
    assert.notEqual(fast.latest().info.group, slow.latest().info.group, "同名でも別実体なら共有しない");
    await within(fast.request("dispatch", update("独立して完了")));
    await within(fast.request("travelOperation", -1));
    await within(fast.request("travelOperation", 1));
    assert.equal(fast.latest().snapshot.contents.departments[0].departmentName, "独立して完了");
    assert.equal(sameComplete, false, "同じファイルの次の保存は先行書き込みを待つ");
    releaseWrite(); await slowSave; await sameSave;
    assert.equal(slow.latest().snapshot.contents.departments[0].departmentName, "同じファイルの次の保存");
    assert.equal((await api.readPlanContents(fastFile.bytes)).departments[0].departmentName, "独立して完了");
  } finally {
    releaseWrite(); await Promise.allSettled([slowSave, sameSave]);
    for (const item of [slow, fast, same]) item.disconnect();
  }
  // Pending reads are registered by file identity before loading has finished.
  let releaseRead;
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  let readStarted;
  const starting = new Promise(resolve => { readStarted = resolve; });
  let count = 0;
  const readingHub = new api.WindowSessionHub(recover => {
    const session = new api.PlanSession(recover), open = session.open.bind(session), index = count++;
    session.open = async plan => { if (index === 0) { readStarted(); await readGate; } await open(plan); };
    return session;
  });
  const loading = peer(readingHub), other = peer(readingHub), joined = peer(readingHub);
  let opening, joining;
  try {
    opening = loading.request("open", { name: slowFile.handle.name, handle: slowFile.handle, bytes });
    await starting;
    joining = joined.request("open", { name: slowFile.handle.name, handle: slowFile.handle, bytes });
    await within(other.request("open", { name: fastFile.handle.name, handle: fastFile.handle, bytes }));
    releaseRead(); await opening; await joining;
    assert.equal(loading.latest().info.group, joined.latest().info.group);
    assert.equal(count, 2, "同時に同じファイルを開いても担当を重複作成しない");
  } finally {
    releaseRead(); await Promise.allSettled([opening, joining]);
    for (const item of [loading, other, joined]) item.disconnect();
  }
  // A loading document must outlive an opener only while another opener needs it.
  for (const keepOther of [false, true]) {
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const began = new Promise(resolve => { started = resolve; });
    let creations = 0;
    const cleanupHub = new api.WindowSessionHub(recover => {
      const session = new api.PlanSession(recover), open = session.open.bind(session);
      if (creations++ === 0) session.open = async plan => { started(); await gate; await open(plan); };
      return session;
    });
    const opener = peer(cleanupHub), survivor = peer(cleanupHub);
    let first, second;
    try {
      first = opener.request("open", { name: original.handle.name, handle: original.handle, bytes });
      await began;
      if (keepOther) {
        second = survivor.request("open", { name: original.handle.name, handle: original.handle, bytes });
        await new Promise(resolve => setImmediate(resolve));
      }
      opener.disconnect(); release(); await first; await second;
      if (keepOther) {
        assert.equal(cleanupHub.groups.size, 1, "別の読込待ちウィンドウがいるデータは保持");
        assert.ok(survivor.latest().snapshot.contents);
        assert.equal(creations, 1);
      } else {
        assert.equal(cleanupHub.groups.size, 0, "読込後に利用者のないデータを解放");
        const latestBytes = await api.saveKindSelection(bytes, "cost-table", [2]);
        await survivor.request("open", { name: original.handle.name, handle: original.handle, bytes: latestBytes });
        assert.deepEqual(survivor.latest().snapshot.contents.kindSelections["cost-table"], [2], "再読込で新しいディスク内容を採用");
        assert.equal(creations, 2);
      }
    } finally { release(); await Promise.allSettled([first, second]); opener.disconnect(); survivor.disconnect(); }
    await Promise.all([...cleanupHub.groups.values()].map(group => group.releasing));
    assert.equal(cleanupHub.groups.size, 0);
  }
  let releaseRecovery;
  const recoveryGate = new Promise(resolve => { releaseRecovery = resolve; });
  let requested = 0;
  const recoveries = [];
  const recoveryHub = new api.WindowSessionHub(recover => {
    const session = new api.PlanSession(recover);
    session.dispatch = async () => {
      if (++requested === 2) releaseRecovery();
      await recoveryGate;
      recoveries.push(await recover("同名.triadic"));
      return session.getSnapshot().contents;
    };
    return session;
  });
  const recoveryA = peer(recoveryHub), recoveryB = peer(recoveryHub);
  try {
    recoveryA.recoveryTarget = slowFile.handle; recoveryB.recoveryTarget = fastFile.handle;
    await recoveryA.request("open", { name: slowFile.handle.name, handle: slowFile.handle, bytes });
    await recoveryB.request("open", { name: fastFile.handle.name, handle: fastFile.handle, bytes });
    await within(Promise.all([recoveryA.request("dispatch", {}), recoveryB.request("dispatch", {})]));
    assert.deepEqual(recoveryA.recovered, ["同名.triadic"]);
    assert.deepEqual(recoveryB.recovered, ["同名.triadic"]);
    assert.deepEqual(new Set(recoveries.map(item => item?.handle)), new Set([slowFile.handle, fastFile.handle]), "並行回復要求をそれぞれの操作元へ返す");
  } finally { releaseRecovery(); recoveryA.disconnect(); recoveryB.disconnect(); }
  console.log("PASS: 別ファイルの保存・取消・読込は独立、同一ファイルの順序と読込中の実体判定は維持");

  // Conflict recovery reserves its destination until the switched session is published.
  const recoverySource = file("競合元.triadic", bytes), occupied = file("使用中.triadic", bytes), recovered = file("復旧先.triadic", new Uint8Array());
  const recovering = peer(), occupiedOwner = peer(), recoveryJoiner = peer();
  const conflicting = await api.saveKindSelection(bytes, "cost-table", [2]);
  const localChange = { type: "settings", change: { type: "selection", screen: "cost-table", selected: [1, 2] } };
  let finishRecovery, recoveryStarted;
  const recoveryWriting = new Promise(resolve => { recoveryStarted = resolve; });
  const holdRecovery = new Promise(resolve => { finishRecovery = resolve; });
  let recoverySave, recoveryOpen;
  try {
    await recovering.request("open", { name: recoverySource.handle.name, handle: recoverySource.handle, bytes });
    await occupiedOwner.request("open", { name: occupied.handle.name, handle: occupied.handle, bytes });
    recoverySource.replace(conflicting);
    recovering.hasDraft = occupiedOwner.hasDraft = true;
    recovering.recoveryTarget = occupied.handle;
    await assert.rejects(recovering.request("dispatch", localChange), /別のウィンドウで使用/);
    assert.deepEqual(recoverySource.bytes, conflicting); assert.deepEqual(occupied.bytes, bytes);
    assert.equal(recovering.hasDraft, true); assert.equal(occupiedOwner.hasDraft, true);
    assert.equal(recovering.latest().snapshot.canUndo, false);
    assert.equal(recovering.latest().handle, recoverySource.handle);

    recovering.recoveryTarget = recovered.handle; recovered.fail = true;
    await assert.rejects(recovering.request("dispatch", localChange), /確認用の保存失敗/);
    assert.equal(hub.saveTargets.size, 0, "復旧の書込み失敗でも予約を解放");
    assert.deepEqual(recovered.bytes, new Uint8Array());
    recovered.fail = false; recovered.gate = async () => { recoveryStarted(); await holdRecovery; };
    recoverySave = recovering.request("dispatch", localChange);
    await recoveryWriting;
    let joined = false;
    recoveryOpen = recoveryJoiner.request("open", { name: recovered.handle.name, handle: recovered.handle, bytes: new Uint8Array() }).then(() => { joined = true; });
    await assert.rejects(occupiedOwner.request("saveAs", recovered.handle), /別のウィンドウで使用/);
    assert.equal(joined, false, "復旧書込み中のopenは公開を待つ");
    finishRecovery(); await recoverySave; await recoveryOpen;
    assert.equal(recoveryJoiner.latest().info.group, recovering.latest().info.group);
    assert.deepEqual(recoveryJoiner.latest().snapshot.contents.kindSelections["cost-table"], [1, 2]);
    assert.deepEqual(recoverySource.bytes, conflicting);
    assert.equal(hub.saveTargets.size, 0);
  } finally {
    finishRecovery(); await Promise.allSettled([recoverySave, recoveryOpen]);
    recovering.disconnect(); occupiedOwner.disconnect(); recoveryJoiner.disconnect();
  }

  for (const pendingKind of ["open", "saveAs"]) {
    const source = file("競合元.triadic", bytes), target = file("予約先.triadic", bytes), otherFile = file("別ファイル.triadic", bytes);
    let release, started;
    const gate = new Promise(resolve => { release = resolve; }), began = new Promise(resolve => { started = resolve; });
    const pendingHub = new api.WindowSessionHub(recover => {
      const session = new api.PlanSession(recover), open = session.open.bind(session);
      session.open = async plan => { if (plan.handle === target.handle) { started(); await gate; } await open(plan); };
      return session;
    });
    const actor = peer(pendingHub), holder = peer(pendingHub);
    let holding;
    try {
      await actor.request("open", { name: source.handle.name, handle: source.handle, bytes });
      source.replace(conflicting); actor.recoveryTarget = target.handle;
      if (pendingKind === "open") holding = holder.request("open", { name: target.handle.name, handle: target.handle, bytes });
      else {
        await holder.request("open", { name: otherFile.handle.name, handle: otherFile.handle, bytes });
        holder.flush = async () => { started(); await gate; };
        holding = holder.request("saveAs", target.handle);
      }
      await began;
      await assert.rejects(actor.request("dispatch", localChange), /別のウィンドウで使用/);
      assert.deepEqual(target.bytes, bytes); assert.deepEqual(source.bytes, conflicting);
      release(); await holding;
    } finally { release(); await holding; actor.disconnect(); holder.disconnect(); }
  }
  console.log("PASS: 競合復旧先の使用中・読込中・保存予約を拒否し、成功時の共有参加と失敗後の予約解放を維持");

  const ticketHub = new api.WindowSessionHub(undefined, 30_000, 20);
  const ticketOwner = peer(ticketHub), ticketCopy = peer(ticketHub);
  const ticketView = { screen: { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" }, costTable: { industries: [], departments: [], top: 0, left: 0 }, relation: null, values: {}, scroll: [] };
  try {
    await ticketOwner.request("open", { name: original.handle.name, handle: original.handle, bytes });
    const group = ticketOwner.latest().info.group;
    await ticketOwner.request("reserve", "never-joined", ticketView);
    assert.equal(ticketHub.tickets.size, 1);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(ticketHub.tickets.size, 0, "起動前に閉じた複製先の予約と画面状態を解放");
    await assert.rejects(ticketCopy.request("join", group, "never-joined"), /開き直/);
    await ticketOwner.request("reserve", "fresh", ticketView);
    await ticketCopy.request("join", group, "fresh");
    assert.deepEqual(ticketCopy.latest().info.initialView, ticketView, "新しい複製先へ正しい画面を渡す");
    assert.equal(ticketHub.tickets.size, 0, "使用済み予約も解放");
    await ticketOwner.request("reserve", "cancel", ticketView);
    await ticketOwner.request("cancel-reserve", "cancel");
    assert.equal(ticketHub.tickets.size, 0);
    await ticketOwner.request("reserve", "closing", ticketView);
  } finally { ticketOwner.disconnect(); ticketCopy.disconnect(); }
  assert.equal(ticketHub.tickets.size, 0, "最後のウィンドウ終了でも予約と期限処理を解放");

  // A final disconnect must retain file identity until the accepted write settles.
  for (const fail of [false, true]) {
    const target = file("閉じて再開.triadic", bytes), independent = file("独立.triadic", bytes);
    target.fail = fail;
    let release, entered;
    const waiting = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    target.gate = async () => { entered(); await waiting; };
    const closing = peer(), reopening = peer(), second = peer(), other = peer();
    let saving, joining, joiningSecond;
    try {
      await closing.request("open", { name: target.handle.name, handle: target.handle, bytes });
      saving = closing.request("dispatch", { type: "department", change: { type: "update", id: 1, departmentName: "確定した部署" } });
      const outcome = saving.then(() => null, error => error);
      await started; closing.disconnect();
      let joined = false;
      joining = reopening.request("open", { name: target.handle.name, handle: target.handle, bytes }).then(() => { joined = true; });
      joiningSecond = second.request("open", { name: target.handle.name, handle: target.handle, bytes });
      await other.request("open", { name: independent.handle.name, handle: independent.handle, bytes });
      assert.equal(joined, false, "同じファイルだけが旧保存を待ち、別ファイルは開ける");
      release();
      assert.equal((await outcome) instanceof Error, fail);
      await Promise.all([joining, joiningSecond]);
      const saved = await api.readPlanContents(target.bytes);
      assert.deepEqual(reopening.latest().snapshot.contents, saved, "成功・失敗ともファイルの確定内容を再読込");
      assert.equal(reopening.latest().info.group, second.latest().info.group);
      target.fail = false; target.gate = undefined;
      await reopening.request("dispatch", { type: "department", change: { type: "update", id: 1, departmentName: "再開後の部署" } });
      assert.equal(second.latest().snapshot.contents.departments[0].departmentName, "再開後の部署", "再参加後のセッションは破棄されない");
      assert.equal(second.latest().snapshot.canUndo, true);
    } finally {
      release(); await Promise.allSettled([saving, joining, joiningSecond]);
      closing.disconnect(); reopening.disconnect(); second.disconnect(); other.disconnect();
    }
  }
  console.log("PASS: 最終切断後の保存成功・失敗を待って再読込し、再参加・別ファイルの独立性を維持");

  await verifyWindowControlTimeout(api, bytes);
  await verifyHistoryCommit(api, bytes);
  await verifyHistoryMembership(api, bytes);
  await verifyWindowTransfer(api);

  const saved = [], controller = new api.AutoSave(async draft => { saved.push(draft); }, 60_000);
  const unregister = api.registerAutoSave(controller);
  try {
    controller.begin("最初"); controller.change("入力中");
    await api.flushAutoSaves(); assert.deepEqual(saved, ["入力中"]);
    controller.pause(); controller.change("変換中");
    await assert.rejects(api.flushAutoSaves(), /変換を確定/);
    assert.equal(controller.getSnapshot().draft, "変換中");
  } finally { unregister(); controller.cancelTimer(); }

  function file(name, initial) {
    let stored = initial.slice();
    const result = { fail: false, get bytes() { return stored; }, replace(value) { stored = value.slice(); } };
    result.handle = { name, kind: "file", isSameEntry: async other => other === result.handle,
      queryPermission: async () => "granted",
      requestPermission: async () => { throw new Error("許可済みの保存でダイアログを要求しない"); },
      getFile: async () => new File([stored], name),
      async createWritable() { let next; return {
        async write(value) { next = new Uint8Array(value).slice(); },
        async close() { await result.gate?.(); if (result.fail) throw new Error("確認用の保存失敗"); stored = next; }, async abort() {},
      }; },
    };
    return result;
  }
}
