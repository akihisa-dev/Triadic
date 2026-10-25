import type { PreviousPatch } from "../core/domain/kinds";
import type { WorkbookExport } from "./workbookExportProcessing";

type Preview = { patches: PreviousPatch[]; retry: boolean };
export type SpreadsheetOperationState = { phase: "idle" }
  | { phase: "exporting"; exportType: WorkbookExport["type"]; controller: AbortController }
  | { phase: "reading" }
  | ({ phase: "preview" | "saving" } & Preview);
export const spreadsheetWorking = (state: SpreadsheetOperationState) => state.phase !== "idle" && state.phase !== "preview";

/** One synchronous state owns admission, confirmation data, cancellation and pending notification. */
export class SpreadsheetOperation {
  private state: SpreadsheetOperationState = { phase: "idle" };
  private listeners = new Set<() => void>();
  constructor(private notifyPending: (pending: boolean) => void) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: SpreadsheetOperationState) {
    this.state = state;
    this.notifyPending(state.phase !== "idle");
    this.listeners.forEach(listener => listener());
  }
  beginReading() {
    if (this.state.phase !== "idle") return null;
    const operation = { phase: "reading" } as const;
    this.publish(operation); return operation;
  }
  beginExport(exportType: WorkbookExport["type"]) {
    if (this.state.phase !== "idle") return null;
    const operation = { phase: "exporting", exportType, controller: new AbortController() } as const;
    this.publish(operation); return operation;
  }
  beginSaving() {
    if (this.state.phase !== "preview") return null;
    const operation = { ...this.state, phase: "saving" } as const;
    this.publish(operation); return operation;
  }
  complete(operation: SpreadsheetOperationState, patches?: PreviousPatch[]) {
    if (this.state !== operation) return;
    this.publish(operation.phase === "reading" && patches?.length ? { phase: "preview", patches, retry: false } : { phase: "idle" });
  }
  fail(operation: SpreadsheetOperationState) {
    if (this.state !== operation) return;
    this.publish(operation.phase === "saving" ? { phase: "preview", patches: operation.patches, retry: true } : { phase: "idle" });
  }
  cancelPreview() { if (this.state.phase === "preview") this.publish({ phase: "idle" }); }
  abortExport() { if (this.state.phase === "exporting") this.state.controller.abort(); }
  dispose() { this.abortExport(); this.publish({ phase: "idle" }); }
}
