import assert from "node:assert/strict";
import { connectWindowSession } from "./window-transport.mjs";

export async function verifyOperationMembership(api) {
  for (const operation of ["saveAs", "undo", "redo"]) for (const joining of ["open", "join"]) for (const failure of [false, true]) {
    let bytes = await api.createTriadicDatabase(2026), writes = 0;
    const file = name => {
      let stored = bytes.slice();
      const handle = { name, isSameEntry: async other => other === handle, queryPermission: async () => "granted",
        getFile: async () => new File([stored], name), createWritable: async () => { let next; return { write: async value => { next = new Uint8Array(value).slice(); }, close: async () => { stored = next; writes++; }, abort: async () => {} }; } };
      return handle;
    };
    const source = file("source.triadic"), target = file("copy.triadic");
    const hub = new api.WindowSessionHub();
    let hold = false, hasDraft = false, started;
    const ready = new Promise(resolve => { started = resolve; });
    const a = connectWindowSession(api, hub, { controls: { draft: () => hasDraft }, toClient: message => {
      if (hold && message.type === "control" && message.action === "flush") { started(); return "hold"; }
    } });
    const b = connectWindowSession(api, hub, { controls: { draft: () => true } });
    try {
      await a.session.open({ name: source.name, handle: source, bytes });
      const group = a.session.getWindowSnapshot().group;
      if (joining === "join") await a.session.request("reserve", "late-ticket", { screen: { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" }, values: {}, scroll: [] });
      await a.session.dispatch({ type: "department", change: { type: "update", id: 1, departmentName: "変更後", industryIds: a.session.getSnapshot().contents.departments[0].industryIds } });
      if (operation === "redo") await a.session.travelOperation(-1);
      hold = true; hasDraft = failure;
      const acting = operation === "saveAs" ? a.session.saveAs(async () => target) : a.session.travelOperation(operation === "undo" ? -1 : 1);
      const outcome = failure ? assert.rejects(acting, /未登録/) : acting;
      await ready;
      let joined = false;
      const entering = (joining === "open" ? b.session.open({ name: source.name, handle: source, bytes: new Uint8Array(await (await source.getFile()).arrayBuffer()) }) : b.session.request("join", group, "late-ticket")).then(() => { joined = true; });
      for (let i = 0; i < 20; i++) await Promise.resolve();
      assert.equal(joined, false, "保存と入力確認の対象が確定するまでは途中参加を待つ");
      const before = writes;
      hold = false; await a.releaseHeld(); await outcome; await entering;
      assert.equal(joined, true, "成功・失敗後に通常参加を再開");
      assert.ok(b.session.getSnapshot().contents);
      if (failure) assert.equal(writes, before, "未登録入力で中止した操作は書き込まない");
      const restored = await api.readPlanContents(new Uint8Array(await (await b.session.getHandle().getFile()).arrayBuffer()));
      assert.deepEqual(b.session.getSnapshot().contents, restored);
    } finally { a.dispose(); b.dispose(); }
  }
}
