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

/** DOM event policy is shared; values, validation and mutations belong to typed adapters. */
export function gridCellEvents(grid: Interaction, cell: GridCell, value: string, adapter: GridCellAdapter) {
  const { selection, setSelection, editing, setEditing, bounds, dragging, focus } = grid;
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (adapter.blocked || event.button !== 0 || (event.target as HTMLElement).closest("button")
        || (editing && selection?.end.row === cell.row && selection.end.column === cell.column && !event.shiftKey)) return;
      event.preventDefault(); dragging.current = true; focus(cell, event.shiftKey);
    },
    input: {
      onFocus(event: FocusEvent<HTMLInputElement>) {
        adapter.captureOriginal(); event.currentTarget.select();
        setSelection(current => current && (current.anchor.row === cell.row && current.anchor.column === cell.column
          || current.end.row === cell.row && current.end.column === cell.column) ? current : { anchor: cell, end: cell });
      },
      onBlur() { setEditing(false); },
      onDoubleClick() { setEditing(true); adapter.captureOriginal(); },
      onChange(event: ChangeEvent<HTMLInputElement>) {
        if (!editing) adapter.captureOriginal();
        setEditing(true); adapter.change(event.target.value, event.target.validity.badInput);
      },
      onCopy(event: ClipboardEvent<HTMLInputElement>) {
        if (editing || !bounds) return;
        event.preventDefault(); event.clipboardData.setData("text/plain", adapter.copy(bounds));
      },
      onPaste(event: ClipboardEvent<HTMLInputElement>) {
        if (!event.clipboardData.types.includes("text/plain")) { event.preventDefault(); return; }
        if (editing) return;
        event.preventDefault();
        adapter.paste(bounds ? { row: bounds.top, column: bounds.left } : cell, event.clipboardData.getData("text/plain"), selection);
      },
      onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || adapter.blocked) return;
        const input = event.currentTarget;
        if (!editing && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) adapter.onTyping?.(input);
        if (event.key === "Escape") {
          event.preventDefault(); adapter.cancel(editing);
          setEditing(false); setSelection({ anchor: cell, end: cell }); return;
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && selection) {
          event.preventDefault(); adapter.fill(selection, value, input); return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && !editing && selection) {
          event.preventDefault(); adapter.fill(selection, "0"); return;
        }
        if (event.key === "F2") { event.preventDefault(); adapter.captureOriginal(); setEditing(true); return; }
        if (editing && event.key !== "Enter" && event.key !== "Tab") return;
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Tab"].includes(event.key)) return;
        event.preventDefault();
        if (editing && !adapter.commit(input)) return;
        const from = event.shiftKey && !editing && selection ? selection.end : cell;
        const next = adapter.next(from, event.key as GridMovementKey, event.shiftKey);
        if (next) focus(next, event.shiftKey && event.key.startsWith("Arrow"));
        else { setEditing(false); if (event.key === "Tab") input.blur(); }
      },
    },
  };
}
