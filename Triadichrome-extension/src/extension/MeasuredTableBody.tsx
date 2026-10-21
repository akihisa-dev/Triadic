import { cloneElement, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";
import { RowSpacer } from "./VirtualTableRows";

/** Window only table rows; measure wrapped names instead of fixing their height. */
export function MeasuredTableBody<T>({ rows, container, columns, estimate = 34, rowKey, render }: {
  rows: readonly T[]; container: RefObject<HTMLDivElement | null>; columns: number; estimate?: number;
  rowKey: (row: T) => string | number; render: (row: T, index: number) => ReactElement;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const measurements = useMemo(() => new Map<number, number>(), [rows]);
  const [revision, setRevision] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 640 });
  const [focus, setFocus] = useState<number | null>(null);
  const bottom = useRef(false);
  const anchor = useRef<{ index: number; within: number; origin: number; bottom: boolean } | null>(null);
  const virtual = rows.length > 200;
  const offsets = useMemo(() => {
    const result = [0];
    for (let i = 0; i < rows.length; i++) result.push(result[i]! + (measurements.get(i) ?? estimate));
    return result;
  }, [rows.length, measurements, revision, estimate]);
  const currentOffsets = useRef(offsets); currentOffsets.current = offsets;
  const indexAt = (position: number) => {
    let low = 0, high = rows.length;
    while (low < high) { const middle = (low + high) >>> 1; if (offsets[middle + 1]! <= position) low = middle + 1; else high = middle; }
    return low;
  };
  const start = virtual ? Math.max(0, indexAt(viewport.top) - 8) : 0;
  const end = virtual ? Math.min(rows.length, indexAt(viewport.top + viewport.height) + 9) : rows.length;
  const indices = new Set(Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index));
  // Retain a focused control and its neighbours so Tab can advance across a
  // window boundary and a dialog can return focus to its original button.
  if (virtual && focus !== null) for (let i = Math.max(0, focus - 1); i <= Math.min(rows.length - 1, focus + 1); i++) indices.add(i);
  const shown = [...indices].sort((a, b) => a - b);
  // The scroll region belongs to our parent. Its ref is attached after child
  // layout effects, so subscribe after all DOM refs have been attached.
  useEffect(() => {
    const region = container.current, section = body.current;
    if (!region || !section || !virtual) return;
    let frame = 0, previousWidth = region.clientWidth;
    const update = () => {
      frame = 0;
      const offset = section.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop;
      const next = { top: Math.max(0, region.scrollTop - offset), height: region.clientHeight };
      setViewport(previous => previous.top === next.top && previous.height === next.height ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const scroll = () => { bottom.current = region.scrollHeight - region.scrollTop - region.clientHeight < 2; schedule(); };
    const previousAnchor = region.style.overflowAnchor; region.style.overflowAnchor = "none";
    const observer = new ResizeObserver(() => {
      if (region.clientWidth !== previousWidth) {
        previousWidth = region.clientWidth; measurements.clear(); setRevision(value => value + 1);
      }
      schedule();
    });
    observer.observe(region); region.addEventListener("scroll", scroll, { passive: true }); update();
    return () => { observer.disconnect(); region.removeEventListener("scroll", scroll); cancelAnimationFrame(frame); region.style.overflowAnchor = previousAnchor; };
  }, [container, virtual, measurements]);
  useLayoutEffect(() => {
    const region = container.current, saved = anchor.current;
    if (!region || !saved) return;
    anchor.current = null;
    region.scrollTop = saved.bottom ? region.scrollHeight : saved.origin + offsets[saved.index]! + saved.within;
    setViewport({ top: Math.max(0, region.scrollTop - saved.origin), height: region.clientHeight });
  }, [offsets, container]);
  const signature = shown.join(",");
  useLayoutEffect(() => {
    if (!virtual || !body.current) return;
    let frame = 0;
    const measure = () => {
      const updates: [number, number][] = [];
      for (const row of body.current!.querySelectorAll<HTMLTableRowElement>("tr[data-window-row]")) {
        const index = Number(row.dataset.windowRow), height = row.getBoundingClientRect().height;
        if (height > 0 && measurements.get(index) !== height) updates.push([index, height]);
      }
      if (updates.length && !frame) frame = requestAnimationFrame(() => {
        const region = container.current, section = body.current;
        if (region && section) {
          const origin = section.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop;
          const position = Math.max(0, region.scrollTop - origin), old = currentOffsets.current;
          let low = 0, high = rows.length;
          while (low < high) { const middle = (low + high) >>> 1; if (old[middle + 1]! <= position) low = middle + 1; else high = middle; }
          anchor.current = { index: low, within: position - old[low]!, origin, bottom: bottom.current };
        }
        frame = 0; updates.forEach(([index, height]) => measurements.set(index, height));
        setRevision(value => value + 1);
      });
    };
    const observer = new ResizeObserver(measure);
    for (const row of body.current.querySelectorAll("tr[data-window-row]")) observer.observe(row);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [signature, virtual, measurements, rows]);
  let previous = 0;
  return <tbody ref={body} onFocusCapture={event => {
    const row = (event.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-window-row]");
    if (row) setFocus(Number(row.dataset.windowRow));
  }}>{shown.map(index => {
    const gap = offsets[index]! - offsets[previous]!; previous = index + 1;
    return <Fragment key={rowKey(rows[index]!)}><RowSpacer columns={columns} height={gap} />
      {cloneElement(render(rows[index]!, index) as ReactElement<Record<string, unknown>>, { "data-window-row": index })}</Fragment>;
  })}<RowSpacer columns={columns} height={offsets[rows.length]! - offsets[previous]!} /></tbody>;
}
