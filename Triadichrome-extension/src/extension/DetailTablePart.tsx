import { useLayoutEffect, useRef, useState } from "react";
import { changeTableAxis, parseTableClipboard, pasteTableCells, setTableCell } from "../core/tables/detailTable";
import { ConfirmationDialog } from "./ConfirmationDialog";
import "./DetailTablePart.css";

type Cell = { row: number; column: number };
export function DetailTablePart({ cells, disabled, index, editing, onEditingChange, onChange }: {
  cells: string[][]; disabled: boolean; index: number; editing: boolean;
  onEditingChange: (editing: boolean) => void; onChange: (cells: string[][]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Cell>({ row: 0, column: 0 });
  const [deleting, setDeleting] = useState<"row" | "column" | null>(null);
  const row = Math.min(selected.row, cells.length - 1), column = Math.min(selected.column, cells[0]!.length - 1);
  useLayoutEffect(() => {
    if (editing && !deleting) root.current?.querySelector<HTMLTextAreaElement>(`[data-row="${row}"][data-column="${column}"]`)?.focus();
  }, [editing, deleting, row, column, cells.length, cells[0]!.length]);
  const begin = () => { if (!disabled) onEditingChange(true); };
  const finish = () => { onEditingChange(false); requestAnimationFrame(() => root.current?.focus({ preventScroll: true })); };
  function alter(axis: "row" | "column", remove: boolean) {
    if (disabled) return;
    const position = axis === "row" ? row : column;
    onChange(changeTableAxis(cells, axis, position, remove));
    setSelected({ row: axis === "row" ? Math.max(0, position + (remove ? -1 : 1)) : row,
      column: axis === "column" ? Math.max(0, position + (remove ? -1 : 1)) : column });
  }
  function requestDelete(axis: "row" | "column") {
    const values = axis === "row" ? cells[row]! : cells.map(values => values[column]!);
    if (values.some(value => value !== "")) setDeleting(axis);
    else alter(axis, true);
  }
  return <div ref={root} className={`detail-table-part${editing ? " is-editing" : ""}`} tabIndex={disabled ? -1 : 0}
    role="group" aria-label={`パーツ ${index + 1}のテーブル`} aria-disabled={disabled}
    onPointerDown={event => { if (editing) event.stopPropagation(); }}
    onDoubleClick={event => { event.stopPropagation(); begin(); }}
    onBlur={event => { if (editing && !deleting && !event.currentTarget.contains(event.relatedTarget)) onEditingChange(false); }}
    onKeyDown={event => {
      if (editing) {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing && !deleting) { event.preventDefault(); finish(); }
      } else if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); event.stopPropagation(); begin();
      }
    }}>
    {editing && <div className="detail-table-toolbar" role="toolbar" aria-label="行と列の操作">
      <button type="button" disabled={disabled} onClick={() => alter("row", false)}>行を追加</button>
      <button type="button" disabled={disabled || cells.length === 1} onClick={() => requestDelete("row")}>行を削除</button>
      <button type="button" disabled={disabled} onClick={() => alter("column", false)}>列を追加</button>
      <button type="button" disabled={disabled || cells[0]!.length === 1} onClick={() => requestDelete("column")}>列を削除</button>
    </div>}
    <div className="detail-table-scroll">
      <table className="detail-part-table" aria-label={`パーツ ${index + 1}の表`}>
        <tbody>{cells.map((values, r) => <tr key={r}>{values.map((value, c) => <td key={c}>
          {editing ? <textarea rows={1} data-row={r} data-column={c} aria-label={`${r + 1}行${c + 1}列`} value={value} disabled={disabled}
            onFocus={() => setSelected({ row: r, column: c })}
            onChange={event => onChange(setTableCell(cells, r, c, event.target.value))}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); setSelected({ row: Math.min(r + 1, cells.length - 1), column: c });
              }
            }}
            onPaste={event => {
              const text = event.clipboardData.getData("text/plain");
              if (!/[\t\r\n]/.test(text)) return;
              event.preventDefault(); onChange(pasteTableCells(cells, r, c, parseTableClipboard(text)));
            }} /> : <div className="detail-table-value">{value || "\u00a0"}</div>}
        </td>)}</tr>)}</tbody>
      </table>
    </div>
    <ConfirmationDialog open={editing && deleting !== null} title={`${deleting === "row" ? "行" : "列"}を削除`}
      message={`選択した${deleting === "row" ? "行" : "列"}の入力内容も削除します。削除しますか？`} confirmLabel="削除する" busy={disabled}
      onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting) alter(deleting, true); setDeleting(null); }} />
  </div>;
}
