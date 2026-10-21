import { parsePreviousWorkbook } from "../core/spreadsheets/workbook";
import type { PreviousWorkbookContents } from "../core/spreadsheets/previousWorkbookContents";
const scope = self as unknown as { onmessage: (event: MessageEvent<{ bytes: Uint8Array; contents: PreviousWorkbookContents }>) => void; postMessage: (value: unknown) => void };
scope.onmessage = async event => {
  try { scope.postMessage({ patches: await parsePreviousWorkbook(event.data.bytes, event.data.contents) }); }
  catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : "Excelファイルを読み込めません。" }); }
};
