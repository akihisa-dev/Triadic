import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import "./ExpansionScrollbar.css";

export const expansionScrollRegionId = "expansion-table-scroll-region";
export type ExpansionScrollTarget = { id: number; name: string; index: number };
type Mark = ExpansionScrollTarget & { target: number; point: number; size: number };
type Geometry = { height: number; width: number; max: number; thumb: number; marks: Mark[] };

/** Uses the existing vertical scrollbar gutter; virtual rows use their full row indices. */
export function ExpansionScrollbar({ container, targets, virtual }: {
  container: RefObject<HTMLDivElement | null>; targets: ExpansionScrollTarget[]; virtual: boolean;
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [top, setTop] = useState(0);
  const latestTop = useRef(0);
  const [pointer, setPointer] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const drag = useRef<{ id: number; y: number; top: number } | null>(null);
  const moved = useRef(false);
  useLayoutEffect(() => {
    const region = container.current, table = region?.querySelector("table");
    if (!region || !table) return;
    const sync = () => {
      if (latestTop.current !== region.scrollTop) { latestTop.current = region.scrollTop; setTop(region.scrollTop); }
    };
    const measure = () => {
      const header = table.tHead?.getBoundingClientRect().height ?? 0;
      const height = region.clientHeight, max = Math.max(0, region.scrollHeight - height);
      const contentHeight = Math.max(1, region.scrollHeight - header);
      const origin = region.getBoundingClientRect().top;
      const marks = targets.map(item => {
        const row = table.querySelector<HTMLElement>(`tr[data-expansion-start="${item.id}"]`);
        const offset = virtual ? item.index * 28 : row ? row.getBoundingClientRect().top - origin + region.scrollTop - header : 0;
        return { ...item, target: Math.min(max, Math.max(0, offset)), point: Math.max(0, offset / contentHeight * height),
          size: Math.min(height, Math.max(18, [...item.name].length * 11 + 6), Math.max(18, height / 2)) };
      });
      const next = { height, width: region.offsetWidth - region.clientWidth, max,
        thumb: Math.min(height, Math.max(24, height * height / region.scrollHeight)), marks };
      setGeometry(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); sync();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(region); observer.observe(table); measure();
    region.addEventListener("scroll", sync, { passive: true });
    const cancel = () => { drag.current = null; };
    window.addEventListener("blur", cancel);
    return () => { observer.disconnect(); region.removeEventListener("scroll", sync); window.removeEventListener("blur", cancel); };
  }, [container, targets, virtual]);
  const placements = useMemo(() => {
    if (!geometry) return [];
    let entries = geometry.marks.map(mark => ({ ...mark, position: 0 }));
    if (entries.reduce((sum, mark) => sum + mark.size + 6, -6) > geometry.height) {
      const near = pointer ?? geometry.thumb / 2 + (geometry.max ? top / geometry.max : 0) * (geometry.height - geometry.thumb);
      let used = 0;
      entries = [...entries].sort((a, b) => Math.abs(a.point - near) - Math.abs(b.point - near)).filter(mark => {
        if (used + mark.size > geometry.height) return false;
        used += mark.size + 6; return true;
      }).sort((a, b) => a.index - b.index);
    }
    let edge = 0;
    for (const mark of entries) { mark.position = Math.max(edge, Math.min(geometry.height - mark.size, mark.point - mark.size / 2)); edge = mark.position + mark.size + 6; }
    let end = geometry.height;
    for (const mark of [...entries].reverse()) { mark.position = Math.max(0, Math.min(mark.position, end - mark.size)); end = mark.position - 6; }
    return entries;
  }, [geometry, pointer, top]);
  if (!geometry || geometry.max <= 0 || geometry.width <= 0 || geometry.height <= 0) return null;
  const stopMotion = () => { const region = container.current; if (region) region.scrollTo({ top: region.scrollTop, behavior: "instant" }); };
  return <div className={`expansion-scrollbar${dismissed ? " expansion-scrollbar-dismissed" : ""}${touchOpen ? " expansion-scrollbar-touch" : ""}`}
    style={{ height: geometry.height, width: geometry.width, "--expansion-scroll-thumb": `${geometry.thumb}px` } as React.CSSProperties}
    onPointerEnter={() => setDismissed(false)} onPointerLeave={() => { if (!drag.current) setPointer(null); setDismissed(false); }}
    onPointerMove={event => { if (!drag.current) setPointer(event.clientY - event.currentTarget.getBoundingClientRect().top); }}
    onFocusCapture={() => setDismissed(false)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTouchOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setDismissed(true); setTouchOpen(false); } }}>
    <input type="range" role="scrollbar" aria-label="展開表の縦スクロール" aria-controls={expansionScrollRegionId} aria-orientation="vertical"
      min={0} max={geometry.max} step={1} value={Math.min(top, geometry.max)}
      onPointerDown={event => { stopMotion(); if (event.pointerType === "touch") setTouchOpen(value => !value); }}
      onChange={event => { if (container.current) container.current.scrollTop = Number(event.target.value); }} />
    <div className="expansion-scroll-marks" role="group" aria-label="展開名へ移動">
      {placements.map(mark => <button key={mark.id} type="button" className="expansion-scroll-mark" aria-label={`${mark.name}の先頭へ移動`}
        style={{ top: mark.position, height: mark.size }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          stopMotion(); moved.current = false; setPointer(mark.point);
          drag.current = { id: event.pointerId, y: event.clientY, top: container.current?.scrollTop ?? 0 };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const held = drag.current, region = container.current;
          if (!held || !region || held.id !== event.pointerId || (!moved.current && Math.abs(event.clientY - held.y) < 4)) return;
          moved.current = true;
          region.scrollTop = held.top + (event.clientY - held.y) / Math.max(1, geometry.height - geometry.thumb) * geometry.max;
        }}
        onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; moved.current = true; }}
        onClick={event => {
          if (event.detail > 0 && moved.current) { moved.current = false; return; }
          container.current?.scrollTo({ top: mark.target, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        }}>{mark.name}</button>)}
    </div>
  </div>;
}
