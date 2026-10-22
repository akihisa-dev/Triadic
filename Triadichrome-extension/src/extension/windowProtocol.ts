import type { PlanContentsPatch } from "../core/domain/planContentsPatch";
import type { PlanSession, SessionSnapshot } from "./PlanSession";
import type { WindowView } from "./windowView";

export type SessionAccess = Pick<PlanSession, "getSnapshot" | "subscribe" | "subscribeFileSave" | "open" | "getHandle" | "prepareSave" | "saveAs" | "dispatch" | "travelOperation" | "checkpoint" | "preview" | "compareHistory" | "restore" | "deleteHistory" | "close">;
export type WindowInfo = { group: string | null; number: number; peers: number; initialView: WindowView | null };
export type WindowControl = "flush" | "flush-input" | "resume" | "draft" | "discard" | "close" | "confirm-discard" | "recover";
export type HubRequest = { type: "request"; id: number; method: string; args: unknown[] };
export type ClientReply = { type: "reply"; id: number; value?: unknown; error?: string };
export type HubMessage =
  | { type: "state"; snapshot: SessionSnapshot; info: WindowInfo; handle?: FileSystemFileHandle; preserveContents?: boolean; contentsPatch?: PlanContentsPatch }
  | { type: "result"; id: number; value?: unknown; error?: string; errorName?: string }
  | { type: "control"; id: number; action: WindowControl; detail?: string; expiresAt?: number }
  | { type: "history-decision"; transaction: string; commit: boolean }
  | { type: "saved"; id: number; handle: FileSystemFileHandle };
