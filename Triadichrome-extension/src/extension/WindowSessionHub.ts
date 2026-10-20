import { PlanSession } from "./PlanSession";
import type { OpenPlan } from "./planFile";
import type { ClientReply, HubMessage, HubRequest, WindowControl, WindowInfo } from "./windowProtocol";
import type { WindowView } from "./windowView";
import { emptyDataHistory } from "../core/domain/dataHistory";
import { scheduleHistoryCheckpoint } from "./historyCheckpoint";
import { reconcileWindowCommand } from "../core/domain/windowCommand";
import type { PlanContents } from "../core/domain/plan";

type Peer = { port: Pick<MessagePort, "postMessage">; group: Group | null; number: number; label: string; initialView: WindowView | null; publishedContents?: PlanContents | null };
type Group = { id: string; session: PlanSession; peers: Set<Peer>; nextNumber: number; cancelCheckpoint?: () => void; actionTail: Promise<void>; historyOwner: Peer | null };
const destinationMissing = async (): Promise<FileSystemFileHandle> => { throw new Error("保存先を選択してください。入力は保持しています。"); };
const errorText = (failure: unknown, field: "message" | "name", fallback: string) => failure && typeof failure === "object" && field in failure && typeof Reflect.get(failure, field) === "string" ? String(Reflect.get(failure, field)) : fallback;

/** One saved document and one operation queue survive any individual window. No plan is persisted here. */
export class WindowSessionHub {
  private groups = new Map<string, Group>();
  private peers = new Set<Peer>();
  private tickets = new Map<string, { group: Group; view: WindowView }>();
  private controls = new Map<number, { peer: Peer; resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private sequence = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private acting: Peer | null = null;
  constructor(private makeSession = () => new PlanSession()) {}

  connect(port: Pick<MessagePort, "postMessage">) {
    const peer: Peer = { port, group: null, number: 1, label: "Home", initialView: null };
    this.peers.add(peer);
    return {
      receive: (message: HubRequest | ClientReply) => {
        if (message.type === "reply") {
          const pending = this.controls.get(message.id);
          if (!pending || pending.peer !== peer) return;
          this.controls.delete(message.id);
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
  private send(peer: Peer, message: HubMessage) { peer.port.postMessage(message); }
  private enqueue<T>(peer: Peer, operation: () => Promise<T>) {
    const task = this.tail.then(async () => {
      this.acting = peer;
      try { return await operation(); } finally { this.acting = null; }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  private control(peer: Peer, action: WindowControl, detail?: string) {
    if (!this.peers.has(peer)) return Promise.reject(new Error(`ウィンドウ${peer.number}は既に閉じられています。`));
    return new Promise<unknown>((resolve, reject) => {
      const id = ++this.sequence;
      this.controls.set(id, { peer, resolve, reject });
      this.send(peer, { type: "control", id, action, ...(detail ? { detail } : {}) });
    });
  }
  recover(name: string) {
    if (!this.acting) return Promise.resolve(null);
    return this.control(this.acting, "recover", name) as Promise<FileSystemFileHandle | null>;
  }
  private info(peer: Peer): WindowInfo {
    return { group: peer.group?.id ?? null, number: peer.number, peers: peer.group?.peers.size ?? 1, initialView: peer.initialView };
  }
  private publish(group: Group) {
    const snapshot = group.session.getSnapshot();
    const handle = group.session.getHandle();
    for (const peer of group.peers) {
      const preserveContents = peer.publishedContents === snapshot.contents;
      peer.publishedContents = snapshot.contents;
      this.send(peer, { type: "state", snapshot: preserveContents ? { ...snapshot, contents: null } : snapshot,
        preserveContents, info: this.info(peer), ...(handle ? { handle } : {}) });
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

  private newGroup() {
    const group: Group = { id: crypto.randomUUID(), session: this.makeSession(), peers: new Set(), nextNumber: 1, actionTail: Promise.resolve(), historyOwner: null };
    this.groups.set(group.id, group);
    group.session.subscribe(() => this.publish(group));
    group.session.subscribeFileSave(async handle => {
      const peer = this.acting;
      if (peer?.group === group) await new Promise<void>((resolve, reject) => {
        const id = ++this.sequence;
        this.controls.set(id, { peer, resolve: () => resolve(), reject });
        this.send(peer, { type: "saved", id, handle });
      }).catch(() => {}); // Remembering the reference must not reverse a committed file save.
    });
    return group;
  }
  private attach(peer: Peer, group: Group, view: WindowView | null = null) {
    peer.group = group; peer.number = group.nextNumber++; peer.initialView = view;
    group.peers.add(peer); this.publish(group);
  }
  private detach(peer: Peer, disconnected = true) {
    const group = peer.group;
    if (disconnected) this.peers.delete(peer);
    for (const [id, pending] of this.controls) if (pending.peer === peer) {
      this.controls.delete(id); pending.reject(new Error(`ウィンドウ${peer.number}を閉じたため処理を中止しました。`));
    }
    if (!group) return;
    group.peers.delete(peer); peer.group = null;
    if (group.historyOwner === peer) group.historyOwner = null;
    if (group.peers.size) this.publish(group);
    else {
      group.cancelCheckpoint?.();
      this.groups.delete(group.id);
      for (const [ticket, reservation] of this.tickets) if (reservation.group === group) this.tickets.delete(ticket);
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
          catch (failure) { throw new Error(`ウィンドウ${item.number} · ${item.label}：${errorText(failure, "message", "保存できませんでした。")}`); }
        }));
        const drafts = (await Promise.all(peers.map(async item => await this.control(item, "draft") ? item : null))).filter(item => item !== null);
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
        await Promise.all([...group.peers].map(item => this.control(item, "resume").catch(() => {})));
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
          const reserved = ticket ? this.tickets.get(ticket) : undefined;
          if (ticket && (!reserved || reserved.group !== group)) throw new Error("ウィンドウを開き直してください。");
          this.attach(peer, group, reserved?.view ?? null);
          if (ticket) this.tickets.delete(ticket);
        }
        return this.info(peer);
      }
      case "reserve": {
        const group = this.requireGroup(peer);
        if (group.historyOwner) throw new Error("履歴の閲覧中はウィンドウを複製できません。");
        const [ticket, view] = args as [string, WindowView];
        this.tickets.set(ticket, { group, view }); return;
      }
      case "cancel-reserve": this.tickets.delete(args[0] as string); return;
      case "label": peer.label = args[0] as string; return;
      case "leave-history": { const group = this.requireGroup(peer); if (group.historyOwner === peer) group.historyOwner = null; return; }
      case "activate": {
        const group = this.requireGroup(peer);
        const others = [...group.peers].filter(item => item !== peer);
        await Promise.all(others.map(item => this.control(item, "flush-input")));
        return;
      }
      case "detach": this.detach(peer); return;
      case "open": return this.enqueue(peer, async () => {
        const plan = args[0] as Pick<OpenPlan, "name" | "bytes" | "handle">;
        if (peer.group) throw new Error("現在のファイルを閉じてください。");
        for (const group of this.groups.values()) {
          const handle = group.session.getHandle();
          if (handle && plan.handle && await handle.isSameEntry(plan.handle)) {
            if (group.historyOwner) throw new Error("同じファイルの履歴を閲覧しています。通常画面に戻ってから開いてください。");
            this.attach(peer, group); return;
          }
        }
        const group = this.newGroup(); this.attach(peer, group);
        try { await group.session.open(plan); }
        catch (failure) { this.detach(peer, false); throw failure; }
      });
      case "history": return this.coordinate(peer, group => this.enqueue(peer, async () => { await group.session.checkpoint(true, destinationMissing); }), true);
      case "travelOperation": return this.coordinate(peer, group => this.enqueue(peer, () => group.session.travelOperation(args[0] as -1 | 1, destinationMissing)));
      case "saveAs": return this.coordinate(peer, group => this.enqueue(peer, () => group.session.saveAs(async () => args[0] as FileSystemFileHandle)));
      case "close": {
        const group = this.requireGroup(peer);
        await this.control(peer, "flush");
        try { return await this.enqueue(peer, async () => {
        if (group.peers.size === 1) await group.session.close(destinationMissing);
        this.detach(peer, false);
        this.send(peer, { type: "state", info: this.info(peer), snapshot: { contents: null, name: "", history: emptyDataHistory, busy: false, historyError: "", canUndo: false, canRedo: false, operationRevision: 0 } });
        }); } finally { await this.control(peer, "resume").catch(() => {}); }
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
