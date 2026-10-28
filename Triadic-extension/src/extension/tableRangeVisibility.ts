/** Reveal a selected amount inside this table's unobscured scroll area. */
export function revealTableRangeCell(region: HTMLElement, cell: HTMLElement): void {
  const table = cell.closest("table");
  if (!table || !region.contains(cell)) return;
  const viewport = region.getBoundingClientRect();
  let top = viewport.top + region.clientTop, left = viewport.left + region.clientLeft;
  let bottom = top + region.clientHeight;
  const right = left + region.clientWidth;
  // Cost tables can freeze the whole head or only its column-header rows.
  const head = table.tHead;
  const vertical = [head, ...(head ? Array.from(head.rows) : []), table.tFoot];
  for (const element of vertical) {
    if (!element || element.contains(cell)) continue;
    const style = getComputedStyle(element);
    if (style.position !== "sticky") continue;
    const rect = element.getBoundingClientRect();
    if (style.top !== "auto") top = Math.max(top, rect.bottom);
    if (style.bottom !== "auto") bottom = Math.min(bottom, rect.top);
  }
  // The first header row has the actual fixed name/classification widths.
  // In narrow layouts the non-name columns are static and are excluded here.
  for (const header of Array.from(head?.rows[0]?.cells ?? [])) {
    const style = getComputedStyle(header);
    if (style.position === "sticky" && style.left !== "auto") left = Math.max(left, header.getBoundingClientRect().right);
  }
  const rect = cell.getBoundingClientRect();
  const offset = (start: number, end: number, min: number, max: number) =>
    start < min ? start - min : end > max ? Math.min(start - min, end - max) : 0;
  if (bottom > top) region.scrollTop += offset(rect.top, rect.bottom, top, bottom);
  if (right > left) region.scrollLeft += offset(rect.left, rect.right, left, right);
}
