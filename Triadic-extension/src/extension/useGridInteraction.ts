import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./TableRangeCopy.css";
import { gridBounds, type GridCell, type GridSelection } from "../core/tables/grid";
/** Selection/focus lifetime shared by grids; amount rules stay in their adapters. */
export function useGridInteraction() {
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [editing, setEditing] = useState(false);
  const [cut, setCut] = useState<{ selection: GridSelection; text: string; token: string; stamp: string } | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const dragging = useRef(false);
  const original = useRef("");
  const bounds = selection ? gridBounds(selection) : null;
  useLayoutEffect(() => {
    const bounds = cut ? gridBounds(cut.selection) : null;
    if (!bounds) {
      for (const cell of table.current?.querySelectorAll("[data-grid-cut]") ?? []) cell.removeAttribute("data-grid-cut");
      return;
    }
    for (const input of table.current?.querySelectorAll<HTMLInputElement>("input[data-row][data-column]") ?? []) {
      const row = Number(input.dataset.row), column = Number(input.dataset.column), cell = input.closest("td")!;
      const inside = bounds && row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right;
      if (inside) cell.setAttribute("data-grid-cut", [row === bounds.top ? "top" : "", row === bounds.bottom ? "bottom" : "", column === bounds.left ? "left" : "", column === bounds.right ? "right" : ""].join(" "));
      else cell.removeAttribute("data-grid-cut");
    }
  }, [cut]);
  useEffect(() => {
    const stop = () => { dragging.current = false; };
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  const extendSelection = (cell: GridCell, buttons: number) => {
    if (!(buttons & 1)) { dragging.current = false; return; }
    if (dragging.current) setSelection(current => current ? { ...current, end: cell } : null);
  };
  const focus = (cell: GridCell, extend = false) => {
    setSelection(current => ({ anchor: extend && current ? current.anchor : cell, end: cell }));
    setEditing(false);
    table.current?.querySelector<HTMLInputElement>(`input[data-row="${cell.row}"][data-column="${cell.column}"]`)?.focus();
  };
  return { selection, setSelection, editing, setEditing, cut, setCut, table, dragging, original, bounds, focus, extendSelection };
}
