import { WindowPlanSession } from "../../Triadichrome-extension/src/extension/WindowPlanSession";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import { createReplacedEmptyInitiativeFixture } from "./sample-plan";
import { installInPageSession } from "./in-page-session";

if (!import.meta.env.DEV) throw new Error("画面テストは開発サーバー専用です。");
const frame = document.querySelector<HTMLIFrameElement>("#app-preview")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const saved = document.querySelector<HTMLPreElement>("#saved")!;
const fixture = await createReplacedEmptyInitiativeFixture();
let bytes = fixture.base, writes = 0, hold = false, release: (() => void) | undefined;
const read = async () => {
  const contents = await readPlanContents(bytes);
  saved.textContent = JSON.stringify({ writes, initiatives: contents.initiatives, account: contents.accounts[0], aggregation: contents.aggregations[0] }, null, 2);
};
const handle = {
  name: "共有編集の確認.triadic", kind: "file",
  async isSameEntry(other: { name: string }) { return other.name === "共有編集の確認.triadic"; },
  async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
  async getFile() { return new File([new Uint8Array(bytes)], "共有編集の確認.triadic"); },
  async createWritable() { let pending: Uint8Array; return {
    async write(data: Uint8Array) { pending = new Uint8Array(data); },
    async close() {
      if (hold) { status.textContent = "保存を保留中"; await new Promise<void>(resolve => { release = resolve; }); }
      bytes = pending; writes++; await read(); status.textContent = "保存完了";
    }, async abort() {},
  }; },
} as unknown as FileSystemFileHandle;
const peer = new WindowPlanSession(installInPageSession());
await peer.open({ bytes, name: handle.name, handle });
frame.addEventListener("load", () => {
  Object.defineProperty(frame.contentWindow!, "showOpenFilePicker", { configurable: true, value: async () => [handle] });
  status.textContent = "操作できます";
});
frame.src = "/?local-session";
document.querySelector("#replace")!.addEventListener("click", () => { void (async () => {
  bytes = fixture.external;
  await peer.dispatch({ type: "settings", change: { type: "selection", screen: "cost-table", selected: [2] } }, async () => handle);
  await read(); status.textContent = "置換を反映しました";
})().catch(error => { status.textContent = String(error); }); });
document.querySelector("#hold")!.addEventListener("click", () => { hold = true; status.textContent = "次の保存を保留します"; });
document.querySelector("#release")!.addEventListener("click", () => { hold = false; release?.(); release = undefined; });
document.querySelector("#read")!.addEventListener("click", () => { void read(); });
await read();
