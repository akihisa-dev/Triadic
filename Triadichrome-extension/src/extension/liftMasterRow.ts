export type LiftedMasterRow = {
  move: (point: { clientX: number; clientY: number }) => void;
  settle: (saved: Promise<boolean>, slot?: HTMLTableRowElement | null) => void;
  cancel: () => void;
  destroy: () => void;
};

/** The floating copy is inert; only the original row participates in editing and saving. */
export function liftMasterRow(row: HTMLTableRowElement, pointer: { clientX: number; clientY: number }, onDone: () => void, destination: () => HTMLTableRowElement | null = () => row): LiftedMasterRow {
  const doc = row.ownerDocument, win = doc.defaultView!;
  const first = row.cells[1]!.getBoundingClientRect(), bounds = row.getBoundingClientRect();
  let width = bounds.right - first.left;
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
  copy.removeAttribute("data-pool-row");
  copy.classList.remove("aggregation-drag-source", "aggregation-lifted-source", "is-highlighted", "is-member", "aggregation-drop-into");
  copy.deleteCell(0);
  for (const [index, cell] of [...copy.cells].entries()) cell.style.width = `${row.cells[index + 1]!.getBoundingClientRect().width}px`;
  copy.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  body.append(copy); block.append(table); layer.append(block); doc.body.append(layer);
  const offset = { x: pointer.clientX - first.left, y: pointer.clientY - bounds.top };
  let x = first.left, y = bounds.top - 4, frame = 0, finished = false, settling = false;
  const position = () => { frame = 0; block.style.transform = `translate3d(${x}px,${y}px,0)`; block.style.width = `${width}px`; };
  position();
  const follow = (event: { clientX: number; clientY: number }) => {
    if (settling) return;
    x = event.clientX - offset.x; y = event.clientY - offset.y - 4;
    if (!frame) frame = win.requestAnimationFrame(position);
  };
  function destroy() {
    if (finished) return;
    finished = true; win.cancelAnimationFrame(frame); layer.remove(); onDone();
  }
  function land(saved: Promise<boolean>, slot?: HTMLTableRowElement | null) {
    if (finished || settling) return;
    settling = true; win.cancelAnimationFrame(frame); position();
    let resolved = false, lastTime = win.performance.now(), stableSince = lastTime;
    let targetX = x, targetY = y, targetWidth = width;
    const reduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void saved.catch(() => false).then(() => { resolved = true; });
    block.style.boxShadow = "0 0 0 #0000";
    const tick = (now: number) => {
      if (finished) return;
      const target = resolved ? destination() : slot?.isConnected ? slot : null;
      const rect = target?.getBoundingClientRect(), left = target?.cells[1]?.getBoundingClientRect().left;
      if (rect && left !== undefined) {
        if (Math.abs(targetX - left) + Math.abs(targetY - rect.top) + Math.abs(targetWidth - (rect.right - left)) > .1) stableSince = now;
        targetX = left; targetY = rect.top; targetWidth = rect.right - left;
      }
      const amount = reduced ? 1 : 1 - Math.exp(-Math.min(40, now - lastTime) / 42);
      lastTime = now; x += (targetX - x) * amount; y += (targetY - y) * amount; width += (targetWidth - width) * amount;
      position();
      if (resolved && Math.abs(targetX - x) + Math.abs(targetY - y) + Math.abs(targetWidth - width) < .3 && (reduced || now - stableSince > 32)) destroy();
      else frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
  }
  return { move: follow, settle: land, cancel: () => land(Promise.resolve(false)), destroy };
}

export type MasterPointerDrag = { cancel: () => void; destroy: () => void };
export function startMasterPointerDrag(handle: HTMLElement, down: PointerEvent, callbacks: {
  start: (point: PointerEvent) => void;
  move: (point: PointerEvent) => void;
  release: (point: PointerEvent) => void;
  cancel: () => void;
}): MasterPointerDrag {
  const doc = handle.ownerDocument, win = doc.defaultView!;
  let started = false, done = false, frame = 0, latest = down;
  const update = () => { frame = 0; if (started && !done) callbacks.move(latest); };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== down.pointerId || done) return;
    latest = event;
    if (!started && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) >= 4) {
      started = true; handle.focus({ preventScroll: true }); callbacks.start(down);
    }
    if (started) { event.preventDefault(); if (!frame) frame = win.requestAnimationFrame(update); }
  };
  function destroy() {
    if (done) return;
    done = true; win.cancelAnimationFrame(frame);
    doc.removeEventListener("pointermove", move, true); doc.removeEventListener("pointerup", release, true);
    doc.removeEventListener("pointercancel", cancel); doc.removeEventListener("keydown", key, true);
    win.removeEventListener("blur", cancel); doc.removeEventListener("visibilitychange", visibility);
    if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId);
  }
  function cancel() { if (done) return; const active = started; destroy(); if (active) callbacks.cancel(); }
  function release(event: PointerEvent) {
    if (event.pointerId !== down.pointerId || done) return;
    const active = started; destroy(); if (active) { callbacks.move(event); callbacks.release(event); }
  }
  function key(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }
  function visibility() { if (doc.hidden) cancel(); }
  doc.addEventListener("pointermove", move, { capture: true, passive: false }); doc.addEventListener("pointerup", release, true);
  doc.addEventListener("pointercancel", cancel); doc.addEventListener("keydown", key, true);
  win.addEventListener("blur", cancel); doc.addEventListener("visibilitychange", visibility);
  try { handle.setPointerCapture(down.pointerId); } catch { /* Synthetic test input has no browser pointer capture. */ }
  return { cancel, destroy };
}
