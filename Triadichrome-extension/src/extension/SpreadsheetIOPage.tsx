import { TableViewHeader, TableViewEmpty, useTableView } from "./TableViewHeader";
import type { TableColumn } from "../core/tables/columnView";
import { amountToYen } from "../core/domain/amounts";
import { emptyTableView } from "../core/tables/columnView";
import { SpreadsheetOperation, spreadsheetWorking, type SpreadsheetOperationState } from "./spreadsheetOperation";
import { PreviousKindSelection } from "./PreviousKindSelection";
import { MeasuredTableBody } from "./MeasuredTableBody";
import { processWorkbookExport, type WorkbookExport } from "./workbookExportProcessing";
import { previousKindName, type PreviousKind, type PreviousSelections } from "../core/domain/kinds";
import { processPreviousWorkbook } from "./previousWorkbookProcessing";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import type { PlanContents } from "../core/domain/plan";
import type { KindSelections, PlanChange, PreviousPatch } from "../core/domain/kinds";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { KindSelectionSlots } from "./KindSelectionSlots";
import { ChoiceChips } from "./ChoiceChips";
import { StatusNotice } from "./StatusNotice";
import { useSavedOperationRevision } from "./SavedOperationRevision";
import type { ExportTable } from "../core/spreadsheets/workbook";
import { previousWorkbookLimits } from "../core/spreadsheets/previousWorkbookLimits";
import { normalizeExportClassificationSelection, type ExportClassificationSelection } from "../core/spreadsheets/exportSelection";
import { previousPatchPresentation } from "../core/spreadsheets/previousPatchPresentation";
import "./SpreadsheetIOPage.css";

const tableNames: Record<ExportTable, string> = { "cost-table": "総原価表", "expansion-table": "展開表", "initiative-list": "施策一覧" };
function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type SpreadsheetIOProps = { contents: PlanContents; busy: boolean; onChangePlan: (change: PlanChange) => Promise<void>; onPrepareSave: () => Promise<void>; onPendingChange: (pending: boolean) => void; onController?: (controller: SpreadsheetOperation | null) => void };
export function SpreadsheetIOPage({ contents, busy, onChangePlan, onPrepareSave, onPendingChange, onController }: SpreadsheetIOProps) {
  const readOnly = useHistoryReadOnly();
  const [tables, setTables] = useState<ExportTable[]>(["cost-table", "expansion-table", "initiative-list"]);
  const [selections, setSelections] = useState<KindSelections>(() => ({ "cost-table": [1], "expansion-table": [1], "initiative-list": [2] }));
  const [previousSelections, setPreviousSelections] = useState<PreviousSelections>({ "cost-table": 1, "expansion-table": 1 });
  const [previousKind, setPreviousKind] = useState<PreviousKind>(1);
  const [classificationSelection, setClassificationSelection] = useState<ExportClassificationSelection>({ industries: [], departments: [], pairs: [] });
  const [classificationSources, setClassificationSources] = useState(() => ({ industries: contents.industries, departments: contents.departments }));
  let currentSelection = classificationSelection;
  if (classificationSources.industries !== contents.industries || classificationSources.departments !== contents.departments) {
    currentSelection = normalizeExportClassificationSelection(contents, classificationSelection);
    setClassificationSources({ industries: contents.industries, departments: contents.departments });
    setClassificationSelection(currentSelection);
  }
  const { industries, departments, pairs } = currentSelection;
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const [controller] = useState(() => new SpreadsheetOperation(pending => pendingCallback.current(pending)));
  const operationState = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => { onController?.(controller); return () => onController?.(null); }, [controller, onController]);
  useEffect(() => () => controller.dispose(), [controller]);
  const working = spreadsheetWorking(operationState);
  const exportType = operationState.phase === "exporting" ? operationState.exportType : null;
  const patches = operationState.phase === "preview" || operationState.phase === "saving" ? operationState.patches : null;
  const retry = (operationState.phase === "preview" || operationState.phase === "saving") && operationState.retry;
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const revision = useSavedOperationRevision();
  const dismiss = useCallback(() => { setNotice(""); setError(false); }, []);
  useEffect(dismiss, [revision, dismiss]);
  const previewRows = useMemo(() => patches ? previousPatchPresentation(contents, patches) : [],
    [patches, contents.industries, contents.departments, contents.accounts]);
  type PreviewRow = typeof previewRows[number];
  const previewColumns: TableColumn<PreviewRow>[] = [
    { id: "industry", label: "業種", type: "choice", value: row => row.industryName },
    { id: "department", label: "部署", type: "choice", value: row => row.departmentName },
    { id: "account", label: "科目", type: "choice", value: row => row.accountName },
    { id: "month", label: "月", type: "choice", value: row => `${row.patch.month}月` },
    { id: "before", label: "変更前", type: "number", scale: 1000, value: row => amountToYen(row.patch.before) },
    { id: "after", label: "変更後", type: "number", scale: 1000, value: row => amountToYen(row.patch.after) },
  ];
  const [previewSource, setPreviewSource] = useState(patches);
  const [previewState, setPreviewState] = useState(emptyTableView);
  if (previewSource !== patches) { setPreviewSource(patches); setPreviewState(emptyTableView()); }
  const previewView = useTableView(previewRows, previewColumns, { state: previewState, change: setPreviewState });
  const input = useRef<HTMLInputElement>(null);
  const previewContainer = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const disabled = busy || working || patches !== null;
  const operation = async <T extends SpreadsheetOperationState,>(state: T | null, action: (state: T) => Promise<PreviousPatch[] | void>) => {
    if (!state) return;
    setNotice(""); setError(false);
    try { controller.complete(state, await action(state) ?? undefined); } catch (failure) {
      controller.fail(state);
      const cancelled = failure instanceof DOMException && failure.name === "AbortError";
      setNotice(cancelled ? "出力を中止しました。" : failure instanceof Error ? failure.message : "処理できませんでした。"); setError(!cancelled);
    }
  };
  const exportFile = (request: WorkbookExport, name: string, message: string) => operation(controller.beginExport(request.type), async state => {
    const bytes = await processWorkbookExport(request, state.controller.signal);
    if (!state.controller.signal.aborted) { download(bytes, name); setNotice(message); }
  });
  const importFiles = async (files: File[]) => {
    if (!files.length || disabled || readOnly) return;
    await operation(controller.beginReading(), async () => {
      if (files.length !== 1) throw new Error("取り込みファイルは一つずつ選択してください。");
      const file = files[0]!;
      if (!/\.xlsx$/i.test(file.name)) throw new Error("前年入力フォーマットのExcelファイル（.xlsx）を選択してください。");
      if (file.size > previousWorkbookLimits.compressedBytes) throw new Error("取り込みファイルは20MB以下にしてください。");
      const changes = await processPreviousWorkbook(new Uint8Array(await file.arrayBuffer()), contents);
      if (!changes.length) { setNotice("変更する金額がありません。"); return; }
      return changes;
    });
  };
  const drag = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled || readOnly ? "none" : "copy";
    setDragging(!disabled && !readOnly);
  };
  return <main className="spreadsheet-io-page" aria-labelledby="spreadsheet-io-title">
    <h1 id="spreadsheet-io-title">入出力</h1>
    <section className="io-panel" aria-labelledby="io-export-title">
      <div className="io-heading"><h2 id="io-export-title">表の出力</h2><span className="field-hint">Excel · 三表と計算元 · 千円</span></div>
      {(Object.keys(tableNames) as ExportTable[]).map(table => <div className="io-table-option" key={table}>
        <label className="io-check"><input type="checkbox" checked={tables.includes(table)} disabled={disabled} onChange={event => setTables(current => event.target.checked ? [...current, table] : current.filter(t => t !== table))} />{tableNames[table]}</label>
        {tables.includes(table) && <div className="io-table-conditions">
          <KindSelectionSlots {...(table === "initiative-list" ? {} : { previousKind: previousSelections[table], onPreviousChange: (value: PreviousKind) => setPreviousSelections(current => ({ ...current, [table]: value })) })} screen={table} selected={selections[table]} disabled={disabled} onChange={selected => setSelections(current => ({ ...current, [table]: selected }))} />
          {table === "cost-table" && <div className="io-classifications">
            <ChoiceChips id="export-industry" label="業種名" value={industries} emptyLabel="全業種の合計" options={contents.industries.map(i => ({ id: i.id, name: i.industryName }))} disabled={disabled} onChange={industries => setClassificationSelection(current => ({ ...current, industries }))} />
            <ChoiceChips id="export-department" label="部署名" value={departments} emptyLabel="全部署の合計" options={contents.departments.map(d => ({ id: d.id, name: d.departmentName }))} disabled={disabled} onChange={departments => setClassificationSelection(current => ({ ...current, departments }))} />
          </div>}
        </div>}
      </div>)}
      <div className="form-actions"><button type="button" className="primary-button" disabled={disabled || !tables.length} onClick={() => { void exportFile({ type: "report", contents,
        options: { tables, selections, previousSelections, costFilter: { industries: industries.length ? industries : null, departments: departments.length ? departments : null } } }, `${contents.fiscalYear}年度予算.xlsx`, "表を出力しました。"); }}>選んだ表を出力</button>
        {exportType === "report" && <button type="button" className="secondary-button" onClick={() => controller.abortExport()}>中止</button>}</div>
    </section>
    <section className={`io-panel io-previous-panel${dragging && !disabled && !readOnly ? " is-drag-active" : ""}`} aria-labelledby="io-previous-title"
      onDragEnter={drag} onDragOver={drag}
      onDragLeave={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={event => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault(); setDragging(false);
        void importFiles(Array.from(event.dataTransfer.files));
      }}>
      <div className="io-heading"><h2 id="io-previous-title">{dragging && !disabled && !readOnly ? "ここにドロップして取り込む" : "前年入力"}</h2><PreviousKindSelection id="export-previous-kind" label="前年" value={previousKind} disabled={disabled} onChange={setPreviousKind} /><span className="field-hint">千円 · 小数点以下3桁まで</span></div>
      <div className="io-pair-list" role="group" aria-label="フォーマットに含める業種・部署">
        {contents.industries.map(i => <fieldset key={i.id}><legend>{i.industryName}</legend>{contents.departments.filter(d => d.industryIds.includes(i.id)).map(d => {
          const checked = pairs.some(p => p.industryId === i.id && p.departmentId === d.id);
          return <label className="io-check" key={d.id}><input type="checkbox" aria-label={`${i.industryName}・${d.departmentName}`} checked={checked} disabled={disabled} onChange={event => setClassificationSelection(current => ({ ...current, pairs: event.target.checked ? [...current.pairs, { industryId: i.id, departmentId: d.id }] : current.pairs.filter(p => p.industryId !== i.id || p.departmentId !== d.id) }))} />{d.departmentName}</label>;
        })}</fieldset>)}
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={disabled || !pairs.length} onClick={() => { void exportFile({ type: "previous", contents, pairs, previousKind }, `${contents.fiscalYear}年度_${previousKindName(previousKind)}入力.xlsx`, "前年入力フォーマットを出力しました。"); }}>フォーマットを出力</button>
        {exportType === "previous" && <button type="button" className="secondary-button" onClick={() => controller.abortExport()}>中止</button>}
        <button type="button" className="primary-button" disabled={disabled || readOnly} onClick={() => input.current?.click()}>フォーマットを取り込む</button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void importFiles(files); }} />
      </div>
      {patches && <div className="io-import-preview" role="region" aria-label="前年金額の変更確認">
        <h3>変更内容 · {previousKindName(patches[0]!.previousKind)} · {previewView.filtered ? `表示 ${previewView.rows.length}件 / 取込対象 ${patches.length}件` : `${patches.length}件`}</h3>
        <div ref={previewContainer} className="io-preview-table"><table><thead><tr>{previewColumns.map(column => <TableViewHeader key={column.id} view={previewView} column={column.id} disabled={working || busy} />)}</tr></thead>
          <MeasuredTableBody key={JSON.stringify(previewView.state)} rows={previewView.rows} container={previewContainer} columns={6} rowKey={({ patch: p }) => `${p.previousKind}:${p.industryId}:${p.departmentId}:${p.accountId}:${p.month}`} render={({ patch: p, industryName, departmentName, accountName }) => <tr>
            <td>{industryName}</td><td>{departmentName}</td><td>{accountName}</td><td>{p.month}月</td><td>{p.before}</td><td>{p.after}</td>
          </tr>} />{!previewView.rows.length && <TableViewEmpty columns={6} />}</table></div>
        <div className="form-actions"><button type="button" className="secondary-button" disabled={working || busy} onClick={() => { controller.cancelPreview(); setNotice(""); }}>キャンセル</button>
          <button type="button" className="primary-button" disabled={working || busy || readOnly} onClick={() => { void operation(controller.beginSaving(), async state => {
            await onPrepareSave(); await onChangePlan({ type: "previous-import", patches: state.patches }); setNotice("前年金額を取り込みました。");
          }); }}>{retry ? "保存を再試行して取り込む" : "確認した内容を取り込む"}</button></div>
      </div>}
    </section>
    <StatusNotice message={working ? "処理中…" : notice} error={error} {...(working ? {} : { onDismiss: dismiss })} />
  </main>;
}
