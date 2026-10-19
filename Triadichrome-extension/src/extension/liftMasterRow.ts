export type LiftedMasterRow = {
  settle: (saved: Promise<boolean>) => void;
  cancel: () => void;
  destroy: () => void;
};

/** The floating copy is inert; only the original row participates in editing and saving. */
export function liftMasterRow(row: HTMLTableRowElement, pointer: { clientX: number; clientY: number }, dataTransfer: DataTransfer, onDone: () => void): LiftedMasterRow {
  const doc = row.ownerDocument, win = doc.defaultView!;
  const first = row.cells[1]!.getBoundingClientRect(), bounds = row.getBoundingClientRect();
  const width = bounds.right - first.left;
  const layer = doc.createElement("div");
  layer.className = "aggregation-floating-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  const block = doc.createElement("div");
  block.className = "aggregation-floating-row master-data-page";
  block.style.width = `${width}px`;
  const table = doc.createElement("table");
  table.className = "aggregation-layout-table";
  const body = table.createTBody(), copy = row.cloneNode(true) as HTMLTableRowElement;
  copy.removeAttribute("data-row");
  copy.classList.remove("aggregation-drag-source", "aggregation-lifted-source", "is-highlighted", "is-member", "aggregation-drop-into");
  copy.deleteCell(0);
  for (const [index, cell] of [...copy.cells].entries()) cell.style.width = `${row.cells[index + 1]!.getBoundingClientRect().width}px`;
  copy.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  body.append(copy); block.append(table); layer.append(block); doc.body.append(layer);
  const blank = doc.createElement("canvas");
  blank.width = blank.height = 1;
  dataTransfer.setDragImage(blank, 0, 0);
  const offset = { x: pointer.clientX - first.left, y: pointer.clientY - bounds.top };
  let x = first.left, y = bounds.top - 4, frame = 0, finished = false, settling = false;
  let animation: Animation | null = null;
  const position = () => { frame = 0; block.style.transform = `translate3d(${x}px,${y}px,0)`; };
  position();
  const follow = (event: DragEvent) => {
    if (settling || (!event.clientX && !event.clientY)) return;
    x = event.clientX - offset.x; y = event.clientY - offset.y - 4;
    if (!frame) frame = win.requestAnimationFrame(position);
  };
  doc.addEventListener("dragover", follow, true);
  function destroy() {
    if (finished) return;
    finished = true; win.cancelAnimationFrame(frame); animation?.cancel();
    doc.removeEventListener("dragover", follow, true); layer.remove(); onDone();
  }
  async function land(saved: Promise<boolean>) {
    if (finished || settling) return;
    settling = true; win.cancelAnimationFrame(frame); position();
    try {
      await saved;
      // React has placed the saved row (or restored the original after failure).
      await new Promise<void>(resolve => win.requestAnimationFrame(() => resolve()));
      if (finished) return;
      const destination = row.getBoundingClientRect(), left = row.cells[1]!.getBoundingClientRect().left;
      animation = block.animate([
        { transform: `translate3d(${x}px,${y}px,0)`, boxShadow: "0 12px 28px #0003" },
        { transform: `translate3d(${left}px,${destination.top}px,0)`, boxShadow: "0 0 0 #0000" },
      ], { duration: win.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      await animation.finished.catch(() => {});
    } finally { destroy(); }
  }
  return { settle: saved => { void land(saved); }, cancel: () => { void land(Promise.resolve(false)); }, destroy };
}
