import type { ChangeEvent, ClipboardEvent, FocusEvent, KeyboardEvent, PointerEvent } from "react";
import type { GridCell, GridSelection, gridBounds } from "../core/tables/grid";
import type { useGridInteraction } from "./useGridInteraction";

type Interaction = ReturnType<typeof useGridInteraction>;
type Bounds = ReturnType<typeof gridBounds>;
export type GridMovementKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Enter" | "Tab";
export type GridCellAdapter = {
  captureOriginal(): void;
  change(value: string, badInput: boolean): void;
  cancel(editing: boolean): void;
  commit(input: HTMLInputElement): boolean;
  fill(selection: GridSelection, value: string, input?: HTMLInputElement): void;
  paste(start: GridCell, text: string, selection: GridSelection | null): void;
  copy(bounds: Bounds): string;
  cutStamp?(selection: GridSelection): string | null;
  move?(source: GridSelection, start: GridCell, stamp: string): boolean;
  next(from: GridCell, key: GridMovementKey, shift: boolean): GridCell | null;
  blocked?: boolean;
  onTyping?(input: HTMLInputElement): void;
};

function stepCell(from: GridCell, key: GridMovementKey, shift: boolean): GridCell {
  let { row, column } = from;
  const step = key === "ArrowUp" || key === "ArrowLeft" || (shift && (key === "Enter" || key === "Tab")) ? -1 : 1;
  if (key === "ArrowUp" || key === "ArrowDown" || key === "Enter") row += step;
  else column += step;
  if (key === "Tab") {
    if (column > 11) { column = 0; row++; }
    if (column < 0) { column = 11; row--; }
  }
  return { row, column };
}

/** Each grid supplies how to skip its non-editable cells (e.g. previous subtotals). */
export function nextGridCell(from: GridCell, key: GridMovementKey, shift: boolean, rowCount: number,
  editable: (cell: GridCell) => boolean, skip = (cell: GridCell) => stepCell(cell, key, shift)): GridCell | null {
  let next = stepCell(from, key, shift);
  const inside = () => next.row >= 0 && next.row < rowCount && next.column >= 0 && next.column < 12;
  while (inside() && !editable(next)) next = skip(next);
  return inside() && editable(next) ? next : null;
}

/** DOM event policy is shared; cached rows may read the latest interaction on demand. */
export function gridCellEvents(grid: Interaction | (() => Interaction), cell: GridCell, value: string, adapter: GridCellAdapter) {
  const current = () => typeof grid === "function" ? grid() : grid;
  let committed = false;
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const { selection, editing, dragging, focus } = current();
      if (adapter.blocked || event.button !== 0 || (event.target as HTMLElement).closest("button")
        || (editing && selection?.end.row === cell.row && selection.end.column === cell.column && !event.shiftKey)) return;
      event.preventDefault(); dragging.current = true; focus(cell, event.shiftKey);
    },
    input: {
      onFocus(event: FocusEvent<HTMLInputElement>) {
        const { setSelection } = current();
        adapter.captureOriginal(); event.currentTarget.select();
        setSelection(current => current && (current.anchor.row === cell.row && current.anchor.column === cell.column
          || current.end.row === cell.row && current.end.column === cell.column) ? current : { anchor: cell, end: cell });
      },
      onBlur(event: FocusEvent<HTMLInputElement>) {
        if (!committed && value.trim().startsWith("=")) adapter.commit(event.currentTarget);
        current().setEditing(false);
      },
      onDoubleClick() { current().setCut(null); current().setEditing(true); adapter.captureOriginal(); },
      onChange(event: ChangeEvent<HTMLInputElement>) {
        const { editing, setEditing } = current();
        current().setCut(null);
        if (!editing) adapter.captureOriginal();
        setEditing(true); adapter.change(event.target.value, event.target.validity.badInput);
      },
      onCopy(event: ClipboardEvent<HTMLInputElement>) {
        current().setCut(null);
        const { editing, bounds } = current();
        if (editing || !bounds) return;
        event.preventDefault(); event.clipboardData.setData("text/plain", adapter.copy(bounds));
      },
      onCut(event: ClipboardEvent<HTMLInputElement>) {
        const { editing, selection, bounds, setCut } = current();
        if (editing) return;
        event.preventDefault();
        if (adapter.blocked || !selection || !bounds || !adapter.cutStamp || !adapter.move) return;
        const stamp = adapter.cutStamp(selection);
        if (stamp === null) return;
        const text = adapter.copy(bounds), token = crypto.randomUUID();
        event.clipboardData.setData("text/plain", text);
        event.clipboardData.setData("application/x-triadic-grid-cut", token);
        setCut({ selection, text, token, stamp });
      },
      onPaste(event: ClipboardEvent<HTMLInputElement>) {
        const { editing, bounds, selection } = current();
        if (!event.clipboardData.types.includes("text/plain")) { event.preventDefault(); return; }
        if (editing) return;
        event.preventDefault();
        if (adapter.blocked) return;
        const { cut, setCut } = current();
        if (cut && event.clipboardData.getData("application/x-triadic-grid-cut") === cut.token && event.clipboardData.getData("text/plain") === cut.text) {
          if (adapter.move?.(cut.selection, bounds ? { row: bounds.top, column: bounds.left } : cell, cut.stamp)) setCut(null);
          return;
        }
        setCut(null);
        adapter.paste(bounds ? { row: bounds.top, column: bounds.left } : cell, event.clipboardData.getData("text/plain"), selection);
      },
      onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        const { selection, setSelection, editing, setEditing, focus } = current();
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || adapter.blocked) return;
        const input = event.currentTarget;
        if (!editing && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) adapter.onTyping?.(input);
        if (event.key === "Escape") {
          if (current().cut) { event.preventDefault(); current().setCut(null); return; }
          event.preventDefault(); adapter.cancel(editing);
          setEditing(false); setSelection({ anchor: cell, end: cell }); return;
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && selection) {
          current().setCut(null);
          event.preventDefault(); adapter.fill(selection, value, input); return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && !editing && selection) {
          current().setCut(null);
          event.preventDefault(); adapter.fill(selection, "0"); return;
        }
        if (event.key === "F2") { event.preventDefault(); current().setCut(null); adapter.captureOriginal(); setEditing(true); return; }
        if (editing && event.key !== "Enter" && event.key !== "Tab") return;
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Tab"].includes(event.key)) return;
        event.preventDefault();
        if (editing && !adapter.commit(input)) return;
        committed = true;
        const from = event.shiftKey && !editing && selection ? selection.end : cell;
        const next = adapter.next(from, event.key as GridMovementKey, event.shiftKey);
        if (next) focus(next, event.shiftKey && event.key.startsWith("Arrow"));
        else { setEditing(false); if (event.key === "Tab") input.blur(); }
      },
    },
  };
}
