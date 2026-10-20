import { emptyDataHistory, type HistoryDeletion } from "../core/domain/dataHistory";
import type { PlanCommand } from "../core/domain/planCommands";
import type { PlanContents } from "../core/domain/plan";
import type { HistoryComparison } from "../core/domain/historyDifference";
import type { OpenPlan } from "./planFile";
import type { SessionSnapshot } from "./PlanSession";
import type { HubMessage, SessionAccess, WindowControl, WindowInfo } from "./windowProtocol";
import type { WindowView } from "./windowView";
import { flushAutoSaves } from "./flushAutoSaves";
import { recoverFileConflict } from "./fileConflict";

type Controls = { draft: () => boolean; discard: () => void; confirmDiscard: (labels: string) => Promise<boolean>; close: () => void };
const emptySnapshot: SessionSnapshot = { contents: null, name: "", history: emptyDataHistory, busy: false, historyError: "", canUndo: false, canRedo: false, operationRevision: 0 };

/** A window owns only its view and drafts; the shared worker owns the document. */
export class WindowPlanSession implements SessionAccess {
  constructor(private createTransport?: () => Pick<SharedWorker, "port" | "onerror">) {}
  private port?: MessagePort;
  private started?: Promise<void>;
  private snapshot = emptySnapshot;
  private info: WindowInfo & { settling: boolean } = { group: null, number: 1, peers: 1, initialView: null, settling: false };
  private handle: FileSystemFileHandle | undefined;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private listeners = new Set<() => void>();
  private windowListeners = new Set<() => void>();
  private savedListeners = new Set<(handle: FileSystemFileHandle) => Promise<void>>();
  private controls: Controls | null = null;
  private releaseLock: (() => void) | undefined;
  private closing = false;
  private activation: Promise<unknown> = Promise.resolve();
  private activationWaiters = new Set<() => void>();
  private flushDepth = 0;
  private failure: Error | null = null;
  getSnapshot = () => this.snapshot;
  getWindowSnapshot = () => this.info;
  getHandle = () => this.handle;
  subscribe = (listener: () => void) => { this.listeners.add(listener); void this.start().catch(() => {}); return () => { this.listeners.delete(listener); }; };
  subscribeWindows = (listener: () => void) => { this.windowListeners.add(listener); return () => { this.windowListeners.delete(listener); }; };
  subscribeFileSave = (listener: (handle: FileSystemFileHandle) => Promise<void>) => { this.savedListeners.add(listener); return () => { this.savedListeners.delete(listener); }; };
  registerControls(controls: Controls) { this.controls = controls; return () => { if (this.controls === controls) this.controls = null; }; }
  isClosing = () => this.closing;
  private updateInfo(patch: Partial<typeof this.info>) {
    const next = { ...this.info, ...patch };
    if (Object.keys(next).every(key => Reflect.get(next, key) === Reflect.get(this.info, key))) return;
    this.info = next; this.windowListeners.forEach(listener => listener());
  }
  private start() {
    return this.started ??= this.initialize();
  }
  private async initialize() {
    const worker = this.createTransport?.() ?? new SharedWorker(new URL("./windowSession.worker.ts", import.meta.url), { type: "module", name: "triadichrome-documents" });
    this.port = worker.port;
    worker.onerror = () => {
      const error = new Error("ウィンドウ間の処理を続けられませんでした。未保存の入力は保持しています。保存済みのファイルから開き直してください。");
      this.failure = error; this.updateInfo({ settling: false });
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear(); this.snapshot = { ...this.snapshot, historyError: error.message };
      this.listeners.forEach(listener => listener());
    };
    this.port.onmessage = event => { void this.receive(event.data as HubMessage); };
    this.port.start();
    const lock = `triadichrome-window:${crypto.randomUUID()}`;
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request(lock, () => { resolve(); return new Promise<void>(release => { this.releaseLock = release; }); }).catch(reject);
    });
    this.port.postMessage({ type: "watch", lock });
    const hash = new URLSearchParams(location.hash.slice(1));
    const group = hash.get("workspace");
    const ticket = hash.get("view");
    try { await this.call("join", group, ticket); }
    catch (failure) { this.snapshot = { ...this.snapshot, historyError: failure instanceof Error ? failure.message : "ウィンドウを開けませんでした。" }; this.listeners.forEach(listener => listener()); }
    if (ticket) { hash.delete("view"); history.replaceState(null, "", `${location.pathname}${location.search}#${hash}`); }
    window.addEventListener("pagehide", () => {
      this.port?.postMessage({ type: "request", id: ++this.sequence, method: "detach", args: [] });
      this.releaseLock?.(); this.port?.close();
    }, { once: true });
    window.addEventListener("blur", () => { void flushAutoSaves().catch(() => {}); });
    window.addEventListener("focus", () => {
      if (this.info.peers > 1 && this.info.group) this.activation = this.call("activate").catch(() => {});
    });
  }
  private call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.failure) { reject(this.failure); return; }
      const id = ++this.sequence;
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
      try { this.port!.postMessage({ type: "request", id, method, args }); }
      catch (failure) { this.pending.delete(id); reject(failure); }
    });
  }
  private async request<T = unknown>(method: string, ...args: unknown[]): Promise<T> { await this.start(); return this.call<T>(method, ...args); }
  private async receive(message: HubMessage) {
    if (message.type === "result") {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(message.errorName === "AbortError" ? new DOMException(message.error, "AbortError") : new Error(message.error));
      else request.resolve(message.value);
    } else if (message.type === "state") {
      const sameGroup = message.info.group === this.info.group;
      this.updateInfo({ ...message.info, initialView: sameGroup ? this.info.initialView : message.info.initialView });
      this.handle = message.handle;
      this.snapshot = message.preserveContents ? { ...message.snapshot, contents: this.snapshot.contents } : message.snapshot;
      this.listeners.forEach(listener => listener());
    } else if (message.type === "saved") {
      try {
        await Promise.all([...this.savedListeners].map(listener => listener(message.handle)));
        this.port!.postMessage({ type: "reply", id: message.id });
      } catch (failure) { this.port!.postMessage({ type: "reply", id: message.id, error: failure instanceof Error ? failure.message : "ファイルの参照を記憶できませんでした。" }); }
    } else {
      try {
        const value = await this.control(message.action, message.detail);
        this.port!.postMessage({ type: "reply", id: message.id, value });
      } catch (failure) {
        this.port!.postMessage({ type: "reply", id: message.id, error: failure instanceof Error ? failure.message : "入力は保持しています。" });
      }
    }
  }
  private async control(action: WindowControl, detail?: string): Promise<unknown> {
    switch (action) {
      case "flush":
      case "flush-input": {
        if (action === "flush") this.updateInfo({ settling: true });
        this.flushDepth++;
        // Rapidly crossing focus changes must not make two windows wait for each other's save.
        this.activationWaiters.forEach(release => release());
        try { await flushAutoSaves(); } finally { this.flushDepth--; }
        return;
      }
      case "resume": this.updateInfo({ settling: false }); return;
      case "draft": return this.controls?.draft() ?? false;
      case "discard": this.controls?.discard(); return;
      case "confirm-discard": return this.controls?.confirmDiscard(detail ?? "") ?? false;
      case "recover": {
        const handle = this.handle;
        if (!handle) throw new Error("保存先が見つかりません。入力は保持しています。");
        return recoverFileConflict(handle);
      }
      case "close": {
        this.closing = true;
        this.controls?.close();
        // Acknowledge first, so pagehide cannot turn a successful close into a failed history action.
        setTimeout(() => {
          // Only this extension's own tab is removed; no tabs permission is required.
          if (typeof chrome !== "undefined" && chrome.tabs?.getCurrent) {
            void chrome.tabs.getCurrent().then(tab => { if (tab?.id !== undefined) void chrome.tabs.remove(tab.id); });
          } else window.close();
        }, 0);
        return;
      }
    }
  }
  async open(plan: Pick<OpenPlan, "name" | "bytes" | "handle">) { await this.request("open", plan); }
  async prepareSave(_destination: () => Promise<FileSystemFileHandle>) {
    const handle = this.handle as FileSystemFileHandle & { queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>; requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState> };
    if (handle?.requestPermission && await handle.queryPermission?.({ mode: "readwrite" }) !== "granted") {
      if (await handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("ファイルへの保存を許可してください。");
    }
    await this.request("prepareSave");
  }
  async dispatch(command: PlanCommand, _destination: () => Promise<FileSystemFileHandle>): Promise<PlanContents> {
    const base = this.snapshot.contents;
    if (!this.flushDepth) {
      let release!: () => void;
      const forcedFlush = new Promise<void>(resolve => { release = resolve; });
      this.activationWaiters.add(release);
      try { await Promise.race([this.activation, forcedFlush]); }
      finally { this.activationWaiters.delete(release); }
    }
    return this.request("dispatch", command, base);
  }
  saveAs(destination: () => Promise<FileSystemFileHandle>): Promise<PlanContents> {
    // The native picker must start in the click, before any asynchronous flushing.
    const selected = destination();
    return selected.then(handle => this.request<PlanContents>("saveAs", handle));
  }
  travelOperation(direction: -1 | 1, _destination: () => Promise<FileSystemFileHandle>) { return this.request<PlanContents>("travelOperation", direction); }
  async checkpoint(force: boolean, _destination: () => Promise<FileSystemFileHandle>) { await this.request("checkpoint", force); }
  preview(id: number, _destination: () => Promise<FileSystemFileHandle>) { return this.request<PlanContents>("preview", id); }
  compareHistory(id: number) { return this.request<HistoryComparison>("compareHistory", id); }
  restore(id: number, _destination: () => Promise<FileSystemFileHandle>) { return this.request<PlanContents>("restore", id); }
  async deleteHistory(deletion: HistoryDeletion, _destination: () => Promise<FileSystemFileHandle>) { await this.request("deleteHistory", deletion); }
  async close(_destination: () => Promise<FileSystemFileHandle>) { await this.request("close"); }
  async enterHistory() { await this.request("history"); }
  leaveHistory() { void this.request("leave-history"); }
  label(label: string) { if (this.info.group) void this.request("label", label); }
  duplicate(view: WindowView) {
    if (!this.info.group) return;
    const ticket = crypto.randomUUID();
    // Reserve before navigating the popup; MessagePort order prevents it from joining early.
    const reserved = this.call("reserve", ticket, view);
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ workspace: this.info.group, view: ticket }).toString();
    const popup = window.open("about:blank", "_blank", `popup,width=${window.outerWidth},height=${window.outerHeight}`);
    if (!popup) { void this.call("cancel-reserve", ticket); throw new Error("別ウィンドウを開けませんでした。ポップアップを許可してください。"); }
    void reserved.then(() => { popup.location.replace(url.href); }, failure => { popup.close(); this.snapshot = { ...this.snapshot, historyError: failure instanceof Error ? failure.message : "ウィンドウを開けませんでした。" }; this.listeners.forEach(listener => listener()); });
  }
}
