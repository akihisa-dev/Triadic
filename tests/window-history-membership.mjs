import assert from "node:assert/strict";

export async function verifyHistoryMembership(api, bytes) {
  for (const phase of ["flush", "confirm-discard", "checkpoint"]) for (const outcome of ["success", "failure", ...(phase === "confirm-discard" ? ["cancel"] : [])]) {
    let reached, release;
    const waiting = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const pause = async () => { reached(); await gate; if (outcome === "failure") throw new Error("確認用の中断"); };
    let first = true;
    const hub = new api.WindowSessionHub(recovery => {
      const session = new api.PlanSession(recovery);
      if (first && phase === "checkpoint") {
        const checkpoint = session.checkpoint.bind(session);
        session.checkpoint = async (...args) => { await pause(); return checkpoint(...args); };
      }
      first = false; return session;
    });
    const clients = [];
    function client() {
      let sequence = 0;
      const pending = new Map();
      const peer = { blocked: false, draft: false, decisions: [], state: null };
      const connection = hub.connect({ postMessage(message) {
        if (message.type === "state") peer.state = message;
        if (message.type === "history-decision") peer.decisions.push(message);
        if (message.type === "result") {
          const request = pending.get(message.id); pending.delete(message.id);
          if (message.error) request.reject(new Error(message.error)); else request.resolve(message.value);
        }
        if (message.type === "control" || message.type === "saved") queueMicrotask(async () => {
          try {
            if (peer.blocked && message.action === phase) await pause();
            connection.receive({ type: "reply", id: message.id, value: message.action === "draft" ? peer.draft : message.action === "confirm-discard" ? outcome !== "cancel" : undefined });
          } catch (error) { connection.receive({ type: "reply", id: message.id, error: error.message }); }
        });
      } });
      peer.request = (method, ...args) => new Promise((resolve, reject) => {
        const id = ++sequence; pending.set(id, { resolve, reject }); connection.receive({ type: "request", id, method, args });
      });
      peer.disconnect = connection.disconnect; clients.push(peer); return peer;
    }
    const file = name => { const handle = { name, getFile: async () => new File([bytes], name), isSameEntry: async other => other === handle }; return { name, handle, bytes }; };
    const source = file("参加対象.triadic"), other = file("別のデータ.triadic");
    const a = client(), b = client(), opening = client(), joining = client(), independent = client();
    try {
      await a.request("open", source); await b.request("open", source);
      const groupId = a.state.info.group;
      await a.request("reserve", "before", { screen: { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" }, values: {}, scroll: [] });
      a.blocked = true; a.draft = true;
      const history = a.request("history");
      const done = outcome === "success" ? history : assert.rejects(history, outcome === "cancel" ? /キャンセル/ : /確認用の中断/);
      await waiting;
      await assert.rejects(opening.request("open", source), /履歴/);
      await assert.rejects(joining.request("join", groupId, "before"), /履歴/);
      await assert.rejects(b.request("reserve", "during", { screen: { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" }, values: {}, scroll: [] }), /履歴/);
      await independent.request("open", other);
      assert.equal(hub.groups.get(groupId).peers.size, 2, `${phase}: 処理中の対象集合を変えない`);
      assert.notEqual(independent.state.info.group, groupId, "別ファイルの参加は妨げない");
      release(); await done;
      assert.equal(hub.groups.get(groupId).historyPreparing, false);
      if (outcome === "success") {
        assert.equal(hub.groups.get(groupId).peers.size, 1);
        assert.ok(b.decisions.some(decision => decision.commit));
        await assert.rejects(opening.request("open", source), /履歴/);
        await a.request("leave-history");
      } else {
        assert.ok(!b.decisions.some(decision => decision.commit));
        assert.equal(hub.groups.get(groupId).historyOwner, null);
      }
      await opening.request("open", source);
      await a.request("reserve", "after", { screen: { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" }, values: {}, scroll: [] });
      await joining.request("join", groupId, "after");
      assert.equal(joining.state.info.group, groupId, "解除後は同じファイルのopenと複製を再開できる");
    } finally { release(); for (const peer of clients) peer.disconnect(); }
  }
  console.log("PASS: 履歴の保存待ち・確認待ち・記録待ちで途中参加を拒否し、取消・失敗・通常画面への復帰後に参加を再開");
}
