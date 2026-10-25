import type { PlanContentsPatch } from "../core/domain/planContentsPatch";
import type { PlanSession, SessionSnapshot } from "./PlanSession";
import type { WindowView } from "./windowView";
import type { WindowCommandBase } from "../core/domain/windowCommand";
import type { PlanCommand } from "../core/domain/planCommands";
import type { PlanContents } from "../core/domain/plan";
import type { HistoryComparison } from "../core/domain/historyDifference";
import type { HistoryDeletion } from "../core/domain/dataHistory";
import type { OpenPlan } from "./planFile";

export type SessionAccess = Pick<PlanSession, "getSnapshot" | "subscribe" | "subscribeFileSave" | "open" | "getHandle" | "prepareSave" | "saveAs" | "dispatch" | "travelOperation" | "checkpoint" | "preview" | "compareHistory" | "restore" | "deleteHistory" | "close"> & { create: (handle: FileSystemFileHandle, fiscalYear: number) => Promise<void> };
export type WindowInfo = { group: string | null; number: number; peers: number; initialView: WindowView | null };
export type WindowControl = "flush" | "flush-input" | "resume" | "draft" | "discard" | "close" | "confirm-discard" | "recover";
export type HubOperations = {
  join: (group: string | null, ticket: string | null) => WindowInfo;
  reserve: (ticket: string, view: WindowView) => void;
  "cancel-reserve": (ticket: string) => void;
  label: (label: string) => void;
  "leave-history": () => void;
  activate: () => void;
  detach: () => void;
  create: (handle: FileSystemFileHandle, fiscalYear: number, expected: Uint8Array) => void;
  open: (plan: Pick<OpenPlan, "name" | "bytes" | "handle">) => void;
  history: () => void;
  travelOperation: (direction: -1 | 1) => PlanContents;
  saveAs: (handle: FileSystemFileHandle, expected: Uint8Array) => PlanContents;
  close: () => void;
  dispatch: (command: PlanCommand, base?: WindowCommandBase | null) => PlanContents;
  prepareSave: () => void;
  checkpoint: (force: boolean) => void;
  preview: (id: number) => PlanContents;
  compareHistory: (id: number) => HistoryComparison;
  restore: (id: number) => PlanContents;
  deleteHistory: (deletion: HistoryDeletion) => void;
};
export type HubMethod = keyof HubOperations;
export type HubArgs<M extends HubMethod> = Parameters<HubOperations[M]>;
export type HubResult<M extends HubMethod> = ReturnType<HubOperations[M]>;
export type HubCall = <M extends HubMethod>(method: M, ...args: HubArgs<M>) => Promise<HubResult<M>>;
export type HubRequest = { [M in HubMethod]: { type: "request"; id: number; method: M; args: HubArgs<M> } }[HubMethod];
/** Generic method/argument correlation is erased only when constructing the wire union. */
export function hubRequest<M extends HubMethod>(id: number, method: M, ...args: HubArgs<M>): HubRequest {
  return { type: "request", id, method, args } as HubRequest;
}
export type ClientReply = { type: "reply"; id: number; value?: unknown; error?: string };
export type HubMessage =
  | { type: "state"; snapshot: SessionSnapshot; info: WindowInfo; handle?: FileSystemFileHandle; preserveContents?: boolean; contentsPatch?: PlanContentsPatch }
  | { type: "result"; id: number; value?: HubResult<HubMethod>; contentsPatch?: PlanContentsPatch; error?: string; errorName?: string }
  | { type: "control"; id: number; action: WindowControl; detail?: string; expiresAt?: number }
  | { type: "history-decision"; transaction: string; commit: boolean }
  | { type: "saved"; id: number; handle: FileSystemFileHandle };
