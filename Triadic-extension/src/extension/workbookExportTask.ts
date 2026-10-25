import { createPreviousWorkbookBytes, createReportWorkbook, serializeWorkbook } from "../core/spreadsheets/workbook";
import type { WorkbookExport } from "./workbookExportProcessing";
export async function exportWorkbookBytes(request: WorkbookExport): Promise<Uint8Array> {
  return request.type === "previous" ? createPreviousWorkbookBytes(request.contents, request.pairs, request.previousKind)
    : serializeWorkbook(createReportWorkbook(request.contents, request.options));
}
