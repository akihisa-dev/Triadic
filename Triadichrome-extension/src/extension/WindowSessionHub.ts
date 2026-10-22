import { diffPlanContents, type PlanContentsPatch } from "../core/domain/planContentsPatch";
import { cloneWindowView } from "./windowViewClone";
import type { Recovery } from "./fileConflict";
import { PlanSession } from "./PlanSession";
import type { OpenPlan } from "./planFile";
import type { ClientReply, HubMessage, HubRequest, WindowControl, WindowInfo } from "./windowProtocol";
import type { WindowView } from "./windowView";
import { emptyDataHistory } from "../core/domain/dataHistory";
import { scheduleHistoryCheckpoint } from "./historyCheckpoint";
import { reconcileWindowCommand } from "../core/domain/windowCommand";
import type { PlanContents } from "../core/domain/plan";

type Peer = { port: Pick<MessagePort, "postMessage">; group: Group | null; number: number; label: string; initialView: WindowView | null; publishedContents?: PlanContents | null; opening?: boolean };
type Group = { id: string; session: PlanSession; peers: Set<Peer>; openingPeers: number; nextNumber: number; cancelCheckpoint?: () => void; releaseRecovery?: () => void; actionTail: Promise<void>; historyOwner: Peer | null; tail: Promise<unknown>; acting: Peer | null; openingHandle: FileSystemFileHandle | undefined; opened: Promise<void> };
const destinationMissing = async (): Promise<FileSystemFileHandle> => { throw new Error("保存先を選択してください。入力は保持しています。"); };
const errorText = (failure: unknown, field: "message" | "name", fallback: string) => failure && typeof failure === "object" && field in failure && typeof Reflect.get(failure, field) === "string" ? String(Reflect.get(failure, field)) : fallback;
class WindowControlTimeoutError extends Error {}

/** One saved document and one operation queue survive any individual window. No plan is persisted here. */
export class WindowSessionHub {
  private groups = new Map<string, Group>();
  private peers = new Set<Peer>();
  private tickets = new Map<string, { group: Group; view: WindowView; expiresAt: number; timer: ReturnType<typeof setTimeout> }>();
  private controls = new Map<number, { peer: Peer; resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private sequence = 0;
  private openingTail: Promise<unknown> = Promise.resolve();
  private saveTargets = new Set<{ handle: FileSystemFileHandle; settled: Promise<void> }>();
  constructor(private makeSession: (recovery: Recovery) => PlanSession = recovery => new PlanSession(recovery), private controlTimeoutMs = 30_000, private reservationTimeoutMs = 30_000) {}

  connect(port: Pick<MessagePort, "postMessage">) {
    const peer: Peer = { port, group: null, number: 1, label: "Home", initialView: null };
    this.peers.add(peer);
    return {
      receive: (message: HubRequest | ClientReply) => {
        if (message.type === "reply") {
          const pending = this.controls.get(message.id);
          if (!pending || pending.peer !== peer) return;
          if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.value);
          return;
        }
        void this.request(peer, message.method, message.args).then(value => this.send(peer, { type: "result", id: message.id, value }), failure => {
          this.send(peer, { type: "result", id: message.id, error: errorText(failure, "message", "処理できませんでした。入力は保持しています。"), errorName: errorText(failure, "name", "Error") });
        });
      },
      disconnect: () => this.detach(peer),
    };
  }
  private removeTicket(ticket: string) {
    const reservation = this.tickets.get(ticket);
    if (reservation) clearTimeout(reservation.timer);
    this.tickets.delete(ticket);
  }
  private releaseGroup(group: Group) {
    group.cancelCheckpoint?.(); this.groups.delete(group.id);
    for (const [ticket, reservation] of this.tickets) if (reservation.group === group) this.removeTicket(ticket);
    // Finish already accepted writes before releasing the document's worker.
    void Promise.allSettled([group.opened, group.tail, group.actionTail]).then(() => group.session.dispose());
  }
  private send(peer: Peer, message: HubMessage) { peer.port.postMessage(message); }
  private enqueue<T>(peer: Peer, operation: () => Promise<T>) {
    const group = this.requireGroup(peer);
    const task = group.tail.then(async () => {
      group.acting = peer;
      try { return await operation(); } finally {
        // Keep the recovery destination reserved through publication of the new handle.
        group.releaseRecovery?.(); delete group.releaseRecovery; group.acting = null;
      }
    });
    group.tail = task.catch(() => {});
    return task;
  }
  private control(peer: Peer, action: WindowControl, detail?: string) {
    return this.reply(peer, (id, expiresAt) => ({ type: "control", id, action, ...(detail ? { detail } : {}),
      ...(expiresAt !== undefined && action !== "resume" ? { expiresAt } : {}) }), action !== "confirm-discard" && action !== "recover");
  }
  private reply(peer: Peer, message: (id: number, expiresAt: number | undefined) => HubMessage, bounded = true) {
    if (!this.peers.has(peer)) return Promise.reject(new Error(`ウィンドウ${peer.number}は既に閉じられています。`));
    return new Promise<unknown>((resolve, reject) => {
      const id = ++this.sequence;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error, value?: unknown) => {
        if (!this.controls.delete(id)) return;
        if (timer !== undefined) clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      this.controls.set(id, { peer, resolve: value => finish(undefined, value), reject: error => finish(error) });
      if (bounded) timer = setTimeout(() => finish(new WindowControlTimeoutError(
        `ウィンドウ${peer.number} · ${peer.label}から${Math.ceil(this.controlTimeoutMs / 1000)}秒以内に応答を確認できませんでした。操作を中止しました。入力は保持しています。応答を確認して同じ操作を再試行してください。`,
      )), this.controlTimeoutMs);
      try { this.send(peer, message(id, bounded ? Date.now() + this.controlTimeoutMs : undefined)); }
      catch (failure) { finish(failure instanceof Error ? failure : new Error("ウィンドウへ要求を送れませんでした。入力は保持しています。")); }
    });
  }
  private info(peer: Peer): WindowInfo {
    return { group: peer.group?.id ?? null, number: peer.number, peers: peer.group?.peers.size ?? 1, initialView: peer.initialView };
  }
  private publish(group: Group) {
    const snapshot = group.session.getSnapshot();
    const handle = group.session.getHandle();
    const patches = new Map<PlanContents, PlanContentsPatch | null>();
    for (const peer of group.peers) {
      const preserveContents = peer.publishedContents === snapshot.contents;
      let contentsPatch: PlanContentsPatch | null = null;
      if (!preserveContents && peer.publishedContents && snapshot.contents) {
        if (!patches.has(peer.publishedContents)) patches.set(peer.publishedContents, diffPlanContents(peer.publishedContents, snapshot.contents));
        contentsPatch = patches.get(peer.publishedContents)!;
      }
      peer.publishedContents = snapshot.contents;
      this.send(peer, { type: "state", snapshot: preserveContents || contentsPatch ? { ...snapshot, contents: null } : snapshot,
        preserveContents, ...(contentsPatch ? { contentsPatch } : {}), info: this.info(peer), ...(handle ? { handle } : {}) });
    }
    group.cancelCheckpoint?.();
    if (group.peers.size) group.cancelCheckpoint = scheduleHistoryCheckpoint({
      getSnapshot: group.session.getSnapshot,
      checkpoint: (force, destination) => {
        const peer = group.peers.values().next().value as Peer | undefined;
        return peer ? this.enqueue(peer, () => group.session.checkpoint(force, destination)) : Promise.resolve();
      },
    }, destinationMissing);
  }

  private newGroup(plan: Pick<OpenPlan, "name" | "bytes" | "handle">) {
    const group: Group = { id: crypto.randomUUID(), session: this.makeSession(async name => {
      if (!group.acting) return null;
      const handle = await this.control(group.acting, "recover", name) as FileSystemFileHandle | null;
      if (handle) group.releaseRecovery = await this.reserveSaveTarget(group, handle);
      return handle;
    }),
      peers: new Set(), openingPeers: 0, nextNumber: 1, actionTail: Promise.resolve(), historyOwner: null, tail: Promise.resolve(), acting: null, opened: Promise.resolve(), openingHandle: plan.handle };
    this.groups.set(group.id, group);
    group.session.subscribe(() => this.publish(group));
    group.session.subscribeFileSave(async handle => {
      const peer = group.acting;
      if (peer?.group === group) await this.reply(peer, id => ({ type: "saved", id, handle }))
        .catch(() => {}); // Remembering the reference must not reverse a committed file save.
    });
    group.opened = group.session.open(plan).then(() => { group.openingHandle = undefined; }, failure => {
      this.releaseGroup(group); throw failure;
    });
    void group.opened.catch(() => {});
    return group;
  }
  private async selectGroup(initial: Pick<OpenPlan, "name" | "bytes" | "handle">): Promise<Group> {
    let plan = initial;
    for (;;) {
      // Reserve identities only. Loading and writing never occupy this queue.
      const selected = this.openingTail.then(async () => {
        for (const target of this.saveTargets.values()) if (plan.handle && await target.handle.isSameEntry(plan.handle)) return { wait: target.settled };
        for (const group of this.groups.values()) {
          const handle = group.openingHandle ?? group.session.getHandle();
          if (handle && plan.handle && await handle.isSameEntry(plan.handle)) { group.openingPeers++; return { group }; }
        }
        const group = this.newGroup(plan); group.openingPeers++; return { group };
      });
      this.openingTail = selected.then(() => {}, () => {});
      const result = await selected;
      if ("group" in result) return result.group;
      await result.wait;
      if (plan.handle) plan = { ...plan, bytes: new Uint8Array(await (await plan.handle.getFile()).arrayBuffer()) };
    }
  }
  private async reserveSaveTarget(group: Group, handle: FileSystemFileHandle): Promise<() => void> {
    const selected = this.openingTail.then(async () => {
      const occupied = () => new Error("別のウィンドウで使用している保存先です。保存先を開いている画面を閉じるか、別の保存先を選択してください。元のファイルと入力は保持しています。");
      // A flush may recover to a different file while this group's Save As is waiting.
      // Reserve each destination independently instead of waiting on our own operation.
      for (const target of this.saveTargets) if (await target.handle.isSameEntry(handle)) throw occupied();
      for (const other of this.groups.values()) if (other !== group) {
        const current = other.openingHandle ?? other.session.getHandle();
        if (current && await current.isSameEntry(handle)) throw occupied();
      }
      let release!: () => void;
      const settled = new Promise<void>(resolve => { release = resolve; });
      const target = { handle, settled };
      this.saveTargets.add(target);
      return () => { this.saveTargets.delete(target); release(); };
    });
    this.openingTail = selected.then(() => {}, () => {});
    return selected;
  }
  private attach(peer: Peer, group: Group, view: WindowView | null = null) {
    peer.group = group; peer.number = group.nextNumber++; peer.initialView = view;
    group.peers.add(peer); this.publish(group);
  }
  private detach(peer: Peer, disconnected = true) {
    const group = peer.group;
    if (disconnected) this.peers.delete(peer);
    for (const pending of this.controls.values()) if (pending.peer === peer) {
      pending.reject(new Error(`ウィンドウ${peer.number}を閉じたため処理を中止しました。`));
    }
    if (!group) return;
    group.peers.delete(peer); peer.group = null; delete peer.publishedContents;
    if (group.historyOwner === peer) group.historyOwner = null;
    if (group.peers.size) this.publish(group);
    else if (!group.openingPeers) {
      this.releaseGroup(group);
    }
  }
  private requireGroup(peer: Peer) {
    if (!peer.group) throw new Error("ファイルを開いてください。");
    return peer.group;
  }
  private coordinate<T>(peer: Peer, operation: (group: Group) => Promise<T>, history = false) {
    const group = this.requireGroup(peer);
    const task = group.actionTail.then(async () => {
      const peers = [...group.peers];
      try {
        // Flush outside the document queue: each UI must be able to submit its pending save.
        await Promise.all(peers.map(async item => {
          try { await this.control(item, "flush"); }
          catch (failure) {
            if (failure instanceof WindowControlTimeoutError) throw failure;
            throw new Error(`ウィンドウ${item.number} · ${item.label}：${errorText(failure, "message", "保存できませんでした。")}`);
          }
        }));
        const drafts = (await Promise.all(peers.map(async item => await this.control(item, "draft", history ? "history" : undefined) ? item : null))).filter(item => item !== null);
        if (drafts.length) {
          const labels = drafts.map(item => `ウィンドウ${item.number} · ${item.label}`).join("、");
          if (!history) throw new Error(`${labels}に未登録の入力があります。入力は保持しています。`);
          if (!await this.control(peer, "confirm-discard", labels)) throw new DOMException("キャンセルしました。", "AbortError");
        }
        const result = await operation(group);
        if (history) {
          // Do not discard or close anything until the saved checkpoint has succeeded.
          for (const item of drafts) await this.control(item, "discard");
          group.historyOwner = peer;
          for (const item of peers) if (item !== peer && group.peers.has(item)) {
            await this.control(item, "close"); this.detach(item);
          }
        }
        return result;
      } finally {
        // Recovery must not add another response timeout to the failed action.
        for (const item of group.peers) void this.control(item, "resume").catch(() => {});
      }
    });
    group.actionTail = task.then(() => {}, () => {});
    return task;
  }
  private async request(peer: Peer, method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case "join": {
        const [groupId, ticket] = args as [string | null, string | null];
        if (groupId) {
          const group = this.groups.get(groupId);
          if (!group) throw new Error("このファイルは既に閉じられています。「ファイルを開く」から開き直してください。");
          if (group.historyOwner) throw new Error("履歴の閲覧中はウィンドウを複製できません。");
          let reserved = ticket ? this.tickets.get(ticket) : undefined;
          if (ticket && reserved && reserved.expiresAt <= Date.now()) { this.removeTicket(ticket); reserved = undefined; }
          if (ticket && (!reserved || reserved.group !== group)) throw new Error("ウィンドウを開き直してください。");
          this.attach(peer, group, reserved?.view ?? null);
          if (ticket) this.removeTicket(ticket);
        }
        return this.info(peer);
      }
      case "reserve": {
        const group = this.requireGroup(peer);
        if (group.historyOwner) throw new Error("履歴の閲覧中はウィンドウを複製できません。");
        const [ticket, view] = args as [string, WindowView];
        this.removeTicket(ticket);
        const timer = setTimeout(() => this.removeTicket(ticket), this.reservationTimeoutMs);
        this.tickets.set(ticket, { group, view: cloneWindowView(view), expiresAt: Date.now() + this.reservationTimeoutMs, timer }); return;
      }
      case "cancel-reserve": this.removeTicket(args[0] as string); return;
      case "label": peer.label = args[0] as string; return;
      case "leave-history": { const group = this.requireGroup(peer); if (group.historyOwner === peer) group.historyOwner = null; return; }
      case "activate": {
        const group = this.requireGroup(peer);
        const others = [...group.peers].filter(item => item !== peer);
        await Promise.all(others.map(item => this.control(item, "flush-input")));
        return;
      }
      case "detach": this.detach(peer); return;
      case "open": {
        if (peer.group || peer.opening) throw new Error("現在のファイルを閉じてください。");
        peer.opening = true;
        let openingGroup: Group | undefined;
        try {
          const plan = args[0] as Pick<OpenPlan, "name" | "bytes" | "handle">;
          const group = await this.selectGroup(plan);
          openingGroup = group;
          await group.opened;
          if (!this.peers.has(peer)) return;
          if (group.historyOwner) throw new Error("同じファイルの履歴を閲覧しています。通常画面に戻ってから開いてください。");
          this.groups.set(group.id, group);
          this.attach(peer, group);
        } finally {
          peer.opening = false;
          if (openingGroup && --openingGroup.openingPeers === 0 && !openingGroup.peers.size) {
            this.releaseGroup(openingGroup);
          }
        }
        return;
      }
      case "history": return this.coordinate(peer, group => this.enqueue(peer, async () => { await group.session.checkpoint(true, destinationMissing); }), true);
      case "travelOperation": return this.coordinate(peer, group => this.enqueue(peer, () => group.session.travelOperation(args[0] as -1 | 1, destinationMissing)));
      case "saveAs": {
        const group = this.requireGroup(peer), handle = args[0] as FileSystemFileHandle;
        const release = await this.reserveSaveTarget(group, handle);
        try { return await this.coordinate(peer, group => this.enqueue(peer, () => group.session.saveAs(async () => handle))); }
        finally { release(); }
      }
      case "close": {
        const group = this.requireGroup(peer);
        try {
          await this.control(peer, "flush");
          return await this.enqueue(peer, async () => {
            if (group.peers.size === 1) await group.session.close(destinationMissing);
            this.detach(peer, false);
            this.send(peer, { type: "state", info: this.info(peer), snapshot: { contents: null, name: "", history: emptyDataHistory, busy: false, historyError: "", canUndo: false, canRedo: false, operationRevision: 0 } });
          });
        } finally { void this.control(peer, "resume").catch(() => {}); }
      }
      default: {
        const group = this.requireGroup(peer);
        return this.enqueue(peer, async () => {
          switch (method) {
            case "dispatch": {
              const command = args[0] as Parameters<PlanSession["dispatch"]>[0];
              const base = args[1] as PlanContents | null | undefined;
              const current = group.session.getSnapshot().contents!;
              return group.session.dispatch(base ? reconcileWindowCommand(command, base, current) : command, destinationMissing);
            }
            case "prepareSave": return group.session.prepareSave(destinationMissing);
            case "checkpoint": return group.session.checkpoint(args[0] as boolean, destinationMissing);
            case "preview": return group.session.preview(args[0] as number, destinationMissing);
            case "compareHistory": return group.session.compareHistory(args[0] as number);
            case "restore": return group.session.restore(args[0] as number, destinationMissing);
            case "deleteHistory": return group.session.deleteHistory(args[0] as Parameters<PlanSession["deleteHistory"]>[0], destinationMissing);
            default: throw new Error("不明なウィンドウ操作です。");
          }
        });
      }
    }
  }
}
