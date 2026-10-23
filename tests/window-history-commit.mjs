import { connectWindowSession } from "./window-transport.mjs";
import assert from "node:assert/strict";

export async function verifyHistoryCommit(api, bytes) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { close() {} } });
  try {
    for (const phase of ["discard", "close"]) for (const failure of ["missing", "reply", "disconnect"]) {
      const hub = new api.WindowSessionHub(undefined, 30), clients = [];
      const handle = { name: "履歴準備.triadic", getFile: async () => new File([bytes], "履歴準備.triadic"), isSameEntry: async other => other === handle };
      function client() {
        const dropped = new Set();
        const state = { input: "保持すべき未登録入力", discards: 0, closes: 0, stop: false, decisions: [] };
        const connection = connectWindowSession(api, hub, {
          toClient(message) {
            if (message.type === "history-decision") state.decisions.push(message);
            if (state.stop && message.type === "control" && message.action === phase) {
              if (failure === "disconnect") return "disconnect";
              if (failure === "missing") return "hold";
              dropped.add(message.id);
            }
          },
          toHub(message) { if (message.type === "reply" && dropped.has(message.id)) return "hold"; },
          controls: { draft: () => !!state.input, discard: () => { state.input = ""; state.discards++; },
            close: () => { state.closes++; }, confirmDiscard: async () => true },
        });
        state.session = connection.session;
        state.connection = connection;
        state.deliverLate = async () => { state.stop = false; dropped.clear(); await connection.releaseHeld(); };
        clients.push(state); return state;
      }
      const a = client(), b = client(), c = client(), failing = phase === "discard" ? b : c;
      try {
        for (const item of clients) await item.session.open({ name: handle.name, handle, bytes });
        failing.stop = true;
        await assert.rejects(a.session.enterHistory(), failure === "disconnect" ? /閉じたため/ : /応答.*入力は保持/);
        for (const item of clients) {
          assert.equal(item.input, "保持すべき未登録入力", `${phase}/${failure}: 確定前は全画面の入力を維持`);
          assert.equal(item.discards, 0); assert.equal(item.closes, 0);
        }
        assert.equal([...hub.groups.values()][0].historyOwner, null);
        await failing.deliverLate();
        await a.session.enterHistory();
        for (const item of clients.filter(item => failure !== "disconnect" || item !== failing)) {
          assert.equal(item.input, ""); assert.equal(item.discards, 1);
          assert.equal(item.closes, item === a ? 0 : 1);
          const decision = item.decisions.find(message => message.commit);
          await item.connection.deliverToClient(decision);
          assert.equal(item.discards, 1, "確定通知の重複で再破棄しない");
        }
        assert.equal([...hub.groups.values()][0].peers.size, 1);
        assert.equal(a.session.getWindowSnapshot().settling, false);
      } finally { for (const item of clients) item.connection.dispose(); }
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window;
  }
  console.log("PASS: 履歴の2件目の破棄・終了の欠落/返信欠落/切断で全入力を保持し、遅延返信後の再試行を一度だけ確定");
}
