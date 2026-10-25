import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { tableValueText, type TableColumn, type TableFilter, type TableValue, type TableViewState } from "../core/tables/columnView";
import { TableFilterIcon } from "./TableViewHeader";

type CellMenu = { column: string; value: TableValue; anchor: HTMLTableCellElement; x: number; y: number };
/** A transient action on existing cells; it changes only the column's display condition. */
export function useTableCellFilter<T>(view: { columns: readonly TableColumn<T>[]; state: TableViewState; change: (state: TableViewState) => void }, disabled = false) {
  const [selected, select] = useState<CellMenu | null>(null);
  useLayoutEffect(() => { select(null); }, [disabled, view.state.filters, view.state.sort]);
  const props = (column: string, value: TableValue): HTMLAttributes<HTMLTableCellElement> => ({
    onContextMenu: event => {
      if (disabled || !view.columns.some(item => item.id === column && item.type !== "number") || (event.target as Element).closest("input,select,textarea,[contenteditable=true]")) return;
      event.preventDefault(); event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      select({ column, value, anchor: event.currentTarget, x: event.clientX || rect.left, y: event.clientY || rect.bottom });
    },
    onKeyDown: event => {
      if (disabled || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) || (event.target as Element).closest("input,select,textarea,[contenteditable=true]")) return;
      event.preventDefault(); event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      select({ column, value, anchor: event.currentTarget, x: rect.left, y: rect.bottom });
    },
  });
  const close = (focus = false) => {
    if (focus && selected) selected.anchor.closest("table")?.querySelector<HTMLElement>(`th[data-table-view-column="${selected.column}"] .table-view-filter`)?.focus({ preventScroll: true });
    select(null);
  };
  return { props, menu: selected && !disabled ? <CellFilterMenu key={`${selected.column}:${tableValueText(selected.value)}`} selected={selected} onClose={close} onApply={() => {
    if (selected.anchor.isConnected) {
      const column = view.columns.find(item => item.id === selected.column)!;
      const text = tableValueText(selected.value);
      const filter: TableFilter = column.type === "choice" && !Array.isArray(selected.value) ? { type: "choice", values: [text] } : { type: "text", text, exact: true };
      view.change({ ...view.state, filters: { ...view.state.filters, [selected.column]: filter } });
    }
    close(true);
  }} /> : null };
}

function CellFilterMenu({ selected, onClose, onApply }: { selected: CellMenu; onClose: (focus?: boolean) => void; onApply: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!, { anchor } = selected;
    element.showPopover();
    const initial = anchor.getBoundingClientRect(), offset = { x: selected.x - initial.left, y: selected.y - initial.top };
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(rect.left + offset.x, window.innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(rect.top + offset.y, window.innerHeight - element.offsetHeight - 8))}px`;
    };
    position(); anchor.classList.add("table-cell-filter-target");
    element.querySelector("button")!.focus({ preventScroll: true });
    const outside = (event: Event) => { if (!element.contains(event.target as Node)) onClose(); };
    const dismiss = () => onClose();
    const scroll = () => {
      const rect = anchor.getBoundingClientRect();
      // A pending focus/scroll restoration may finish after the right click.
      // Follow it; wheel/touch/scrollbar gestures still dismiss the action.
      if (!anchor.isConnected || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) dismiss();
      else position();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("wheel", outside, { capture: true, passive: true });
    document.addEventListener("touchmove", outside, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    return () => {
      anchor.classList.remove("table-cell-filter-target");
      document.removeEventListener("pointerdown", outside, true); document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("wheel", outside, true); document.removeEventListener("touchmove", outside, true); window.removeEventListener("resize", dismiss);
    };
  }, [selected]);
  return createPortal(<div ref={menu} popover="manual" role="menu" aria-label="セルの絞り込み" className="table-cell-filter-menu" onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(true); }
  }}><button type="button" role="menuitem" aria-label="この値で絞り込む" title="この値で絞り込む" onClick={onApply}><TableFilterIcon /></button></div>, selected.anchor.closest("dialog") ?? document.body);
}
