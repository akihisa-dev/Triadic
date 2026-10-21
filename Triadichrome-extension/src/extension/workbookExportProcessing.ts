import type { PlanContents } from "../core/domain/plan";
import type { PreviousKind } from "../core/domain/kinds";
import type { ExportOptions, PreviousPair } from "../core/spreadsheets/workbook";
export type WorkbookExport = { type: "report"; contents: PlanContents; options: ExportOptions }
  | { type: "previous"; contents: PlanContents; pairs: PreviousPair[]; previousKind: PreviousKind };

/** A cancellable export owns its worker; cancellation never interrupts a save. */
export function processWorkbookExport(request: WorkbookExport, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) return Promise.reject(new DOMException("出力を中止しました。", "AbortError"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./workbookExport.worker.ts", import.meta.url), { type: "module" });
    let finished = false;
    const finish = (bytes?: Uint8Array, error?: Error) => {
      if (finished) return;
      finished = true; worker.terminate(); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(bytes!);
    };
    const abort = () => finish(undefined, new DOMException("出力を中止しました。", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = event => {
      if (typeof event.data.error === "string") finish(undefined, new Error(event.data.error || "Excelを出力できませんでした。"));
      else if (event.data.bytes instanceof Uint8Array) finish(event.data.bytes);
      else finish(undefined, new Error("Excelの出力結果を確認できませんでした。もう一度出力してください。"));
    };
    worker.onerror = () => finish(undefined, new Error("Excelの出力を続けられませんでした。計画は変更していません。もう一度出力してください。"));
    if (signal.aborted) { abort(); return; }
    try { worker.postMessage(request); }
    catch (error) { finish(undefined, error instanceof Error ? error : new Error("Excelを出力できませんでした。")); }
  });
}
