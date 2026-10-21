import { exportWorkbookBytes } from "./workbookExportTask";
import type { WorkbookExport } from "./workbookExportProcessing";
const scope = self as unknown as { onmessage: ((event: MessageEvent<WorkbookExport>) => void) | null; postMessage: (value: unknown, transfer: Transferable[]) => void };
scope.onmessage = async event => {
  try {
    const bytes = await exportWorkbookBytes(event.data);
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : "Excelを出力できませんでした。" }, []); }
};
