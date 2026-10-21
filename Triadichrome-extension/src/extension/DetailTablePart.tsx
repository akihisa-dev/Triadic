import { useLayoutEffect, useRef, useState } from "react";
import { changeTableItem, detailTableMonths, parseTableClipboard, pasteTableCells, setTableCell } from "../core/tables/detailTable";
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
  function cell(i: number, c: number) {
    const value = cells[i]![c]!;
    return editing ? <textarea rows={1} data-item={i} data-column={c}
      aria-label={c === 0 ? `項目 ${i + 1}の名前` : `項目 ${i + 1}の${detailTableMonths[c - 1]!.label}`} value={value} disabled={disabled}
      onFocus={() => setSelected({ item: i, column: c })}
      onChange={event => onChange(setTableCell(cells, i, c, event.target.value))}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          setSelected(horizontal ? { item: Math.min(i + 1, cells.length - 1), column: c }
            : { item: i, column: Math.min(c + 1, detailTableMonths.length) });
        }
      }}
      onPaste={event => {
        const text = event.clipboardData.getData("text/plain");
        if (!/[\t\r\n]/.test(text)) return;
        event.preventDefault();
        const result = pasteTableCells(cells, i, c, parseTableClipboard(text), horizontal);
        if (!result) { setError("12か月の範囲を超えるため、貼り付けませんでした。貼り付ける範囲を調整してください。"); return; }
        setError(""); onChange(result);
      }} /> : <div className="detail-table-value">{value || "\u00a0"}</div>;
  }
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
        <colgroup><col className="detail-table-label-column" />{(horizontal ? detailTableMonths : cells).map((_, i) => <col key={i} />)}</colgroup>
        <thead><tr><th className="detail-table-corner" scope="col">{horizontal ? "項目" : "月"}</th>
          {horizontal ? detailTableMonths.map(month => <th key={month.id} scope="col">{month.label}</th>)
            : cells.map((_, i) => <th key={i} scope="col">{cell(i, 0)}</th>)}
        </tr></thead>
        <tbody>{horizontal ? cells.map((_, i) => <tr key={i}>
          <th scope="row">{cell(i, 0)}</th>{detailTableMonths.map((month, m) => <td key={month.id}>{cell(i, m + 1)}</td>)}
        </tr>) : detailTableMonths.map((month, m) => <tr key={month.id}>
          <th scope="row">{month.label}</th>{cells.map((_, i) => <td key={i}>{cell(i, m + 1)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <ConfirmationDialog open={editing && deleting} title="項目を削除"
      message="選択した項目の名前と12か月の入力内容も削除します。削除しますか？" confirmLabel="削除する" busy={disabled}
      onCancel={() => setDeleting(false)} onConfirm={() => { alter(true); setDeleting(false); }} />
  </div>;
}
