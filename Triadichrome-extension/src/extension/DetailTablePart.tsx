import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { changeTableItem, detailTableMonths, parseTableClipboard, pasteTableCells, setTableCell } from "../core/tables/detailTable";
import { DetailTableColumns, DetailTableHead, DetailTableRows, type TableCellHandlers } from "./DetailTableCells";
import { ConfirmationDialog } from "./ConfirmationDialog";
import "./DetailTablePart.css";

type Cell = { item: number; column: number };
export function DetailTablePart({ cells, horizontal, disabled, index, editing, onEditingChange, onChange }: {
  cells: string[][]; horizontal: boolean; disabled: boolean; index: number; editing: boolean;
  onEditingChange: (editing: boolean) => void; onChange: (cells: string[][]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Cell>({ item: 0, column: 0 });
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const item = Math.min(selected.item, cells.length - 1), column = Math.min(selected.column, detailTableMonths.length);
  useLayoutEffect(() => {
    if (editing && !deleting) root.current?.querySelector<HTMLTextAreaElement>(`[data-item="${item}"][data-column="${column}"]`)?.focus();
  }, [editing, deleting, item, column, cells.length]);
  const begin = () => { if (!disabled) onEditingChange(true); };
  const finish = () => { onEditingChange(false); setError(""); requestAnimationFrame(() => root.current?.focus({ preventScroll: true })); };
  function alter(remove: boolean) {
    if (disabled) return;
    onChange(changeTableItem(cells, item, remove));
    setSelected({ item: Math.max(0, item + (remove ? -1 : 1)), column });
  }
  function requestDelete() {
    if (cells[item]!.some(value => value !== "")) setDeleting(true);
    else alter(true);
  }
  const latest = useRef({ cells, horizontal, disabled, onChange });
  latest.current = { cells, horizontal, disabled, onChange };
  const handlers = useMemo<TableCellHandlers>(() => ({
    select: (item, column) => setSelected(previous => previous.item === item && previous.column === column ? previous : { item, column }),
    change: (item, column, value) => {
      const current = latest.current;
      if (!current.disabled) current.onChange(setTableCell(current.cells, item, column, value));
    },
    advance: (item, column) => {
      const current = latest.current;
      setSelected(current.horizontal ? { item: Math.min(item + 1, current.cells.length - 1), column }
        : { item, column: Math.min(column + 1, detailTableMonths.length) });
    },
    paste: (item, column, text) => {
      const current = latest.current;
      if (current.disabled) return;
      const result = pasteTableCells(current.cells, item, column, parseTableClipboard(text), current.horizontal);
      if (!result) { setError("12か月の範囲を超えるため、貼り付けませんでした。貼り付ける範囲を調整してください。"); return; }
      setError(""); current.onChange(result);
    },
  }), []);
  return <div ref={root} className={`detail-table-part${editing ? " is-editing" : ""}`} tabIndex={disabled ? -1 : 0}
    role="group" aria-label={`パーツ ${index + 1}の${horizontal ? "横向き" : "縦向き"}12か月`} aria-disabled={disabled}
    onPointerDown={event => { if (editing) event.stopPropagation(); }}
    onDoubleClick={event => { event.stopPropagation(); begin(); }}
    onBlur={event => { if (editing && !deleting && !event.currentTarget.contains(event.relatedTarget)) { onEditingChange(false); setError(""); } }}
    onKeyDown={event => {
      if (editing) {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing && !deleting) { event.preventDefault(); finish(); }
      } else if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); event.stopPropagation(); begin();
      }
    }}>
    {editing && <div className="detail-table-toolbar" role="toolbar" aria-label="項目の操作">
      <button type="button" disabled={disabled} onClick={() => alter(false)}>項目を追加</button>
      <button type="button" disabled={disabled || cells.length === 1} onClick={requestDelete}>項目を削除</button>
    </div>}
    {editing && error && <p className="detail-table-error" role="alert">{error}</p>}
    <div className="detail-table-scroll">
      <table className={`detail-part-table ${horizontal ? "is-horizontal" : "is-vertical"}`} aria-label={`パーツ ${index + 1}の表`}>
        <DetailTableColumns count={horizontal ? detailTableMonths.length : cells.length} />
        <DetailTableHead cells={cells} horizontal={horizontal} editing={editing} disabled={disabled} handlers={handlers} />
        <DetailTableRows cells={cells} horizontal={horizontal} editing={editing} disabled={disabled} handlers={handlers} />
      </table>
    </div>
    <ConfirmationDialog open={editing && deleting} title="項目を削除"
      message="選択した項目の名前と12か月の入力内容も削除します。削除しますか？" confirmLabel="削除する" busy={disabled}
      onCancel={() => setDeleting(false)} onConfirm={() => { alter(true); setDeleting(false); }} />
  </div>;
}
