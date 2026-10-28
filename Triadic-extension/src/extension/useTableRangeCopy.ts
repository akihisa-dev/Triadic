import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { gridBounds, type GridCell, type GridSelection } from "../core/tables/grid";
import { revealTableRangeCell } from "./tableRangeVisibility";
import "./TableRangeCopy.css";

export const tableCopyCell = (row: number, column: number) => ({ "data-copy-row": row, "data-copy-column": column });

/** Coordinates refer to the full displayed model, including rows outside the DOM window. */
export function useTableRangeCopy(container: RefObject<HTMLDivElement | null>, options: {
  rowCount: number; columnCount: number; textAt: (row: number, column: number) => string; resetKey: unknown;
}) {
  const latest = useRef(options); latest.current = options;
  const selection = useRef<GridSelection | null>(null);
  const drag = useRef<{ anchor: GridCell; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const cellAt = (target: EventTarget | null): GridCell | null => {
    const cell = target instanceof Element ? target.closest<HTMLElement>("[data-copy-row][data-copy-column]") : null;
    if (!cell || !container.current?.contains(cell)) return null;
    return { row: Number(cell.dataset.copyRow), column: Number(cell.dataset.copyColumn) };
  };
  const paint = () => {
    const bounds = selection.current ? gridBounds(selection.current) : null;
    if (!bounds) {
      for (const cell of container.current?.querySelectorAll("[data-range-selected]") ?? []) cell.removeAttribute("data-range-selected");
      return;
    }
    for (const cell of container.current?.querySelectorAll<HTMLElement>("[data-copy-row]") ?? []) {
      const row = Number(cell.dataset.copyRow), column = Number(cell.dataset.copyColumn);
      if (bounds && row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right) cell.setAttribute("data-range-selected", "true");
      else cell.removeAttribute("data-range-selected");
    }
  };
  useLayoutEffect(() => { selection.current = null; drag.current = null; suppressClick.current = false; paint(); }, [options.resetKey]);
  useLayoutEffect(paint);
  useEffect(() => {
    let frame = 0;
    const extend = (target: EventTarget | null) => {
      const cell = cellAt(target), current = drag.current;
      if (!current || !cell) return;
      if (cell.row !== current.anchor.row || cell.column !== current.anchor.column) current.moved = true;
      if (current.moved) {
        selection.current = { anchor: current.anchor, end: cell }; suppressClick.current = true;
        container.current?.focus({ preventScroll: true }); paint();
      }
    };
    const scroll = () => {
      frame = 0;
      const current = drag.current, region = container.current;
      if (!current || !region) return;
      const box = region.getBoundingClientRect();
      const delta = (value: number, min: number, max: number) => value < min + 28 ? -16 : value > max - 28 ? 16 : 0;
      const x = delta(current.x, box.left, box.right), y = delta(current.y, box.top, box.bottom);
      if (x || y) {
        region.scrollBy(x, y);
        extend(document.elementFromPoint(Math.max(box.left + 2, Math.min(box.right - 18, current.x)), Math.max(box.top + 2, Math.min(box.bottom - 18, current.y))));
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      if (!(event.buttons & 1)) { drag.current = null; return; }
      current.x = event.clientX; current.y = event.clientY; extend(event.target);
      if (!frame) frame = requestAnimationFrame(scroll);
    };
    const stop = () => {
      drag.current = null; cancelAnimationFrame(frame); frame = 0;
    };
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", stop); document.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", stop); document.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hide); cancelAnimationFrame(frame);
    };
  }, [container]);
  return {
    onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      const cell = cellAt(event.target);
      suppressClick.current = false;
      if (!cell) { selection.current = null; drag.current = null; paint(); return; }
      event.preventDefault();
      const anchor = event.shiftKey && selection.current ? selection.current.anchor : cell;
      selection.current = { anchor, end: cell };
      drag.current = { anchor, x: event.clientX, y: event.clientY, moved: event.shiftKey };
      suppressClick.current = event.shiftKey;
      container.current?.focus({ preventScroll: true }); paint();
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (event.detail !== 0 && suppressClick.current && cellAt(event.target)) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
    },
    onCopy(event: ClipboardEvent<HTMLDivElement>) {
      if ((event.target as HTMLElement).closest("input,textarea")) return;
      const chosen = selection.current ?? (cellAt(event.target) ? { anchor: cellAt(event.target)!, end: cellAt(event.target)! } : null);
      if (!chosen) return;
      const bounds = gridBounds(chosen), { rowCount, columnCount, textAt } = latest.current;
      if (bounds.bottom >= rowCount || bounds.right >= columnCount) return;
      const lines: string[] = [];
      for (let row = bounds.top; row <= bounds.bottom; row++) {
        const values: string[] = [];
        for (let column = bounds.left; column <= bounds.right; column++) values.push(textAt(row, column));
        lines.push(values.join("\t"));
      }
      event.preventDefault(); event.clipboardData.setData("text/plain", lines.join("\n"));
    },
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || (event.target as HTMLElement).closest("input,textarea")) return;
      if (event.key === "Escape") { selection.current = null; drag.current = null; suppressClick.current = false; paint(); return; }
      const active = selection.current ?? (cellAt(event.target) ? { anchor: cellAt(event.target)!, end: cellAt(event.target)! } : null);
      if (!active || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      drag.current = null;
      const { rowCount, columnCount } = latest.current;
      const end = { row: Math.max(0, Math.min(rowCount - 1, active.end.row + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))),
        column: Math.max(0, Math.min(columnCount - 1, active.end.column + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))) };
      event.preventDefault(); selection.current = { anchor: event.shiftKey ? active.anchor : end, end }; paint();
      const region = container.current;
      const cell = region?.querySelector<HTMLElement>(`[data-copy-row="${end.row}"][data-copy-column="${end.column}"]`);
      if (region && cell) revealTableRangeCell(region, cell);
    },
  };
}
