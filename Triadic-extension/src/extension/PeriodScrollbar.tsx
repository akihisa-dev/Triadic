import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { tablePeriods } from "../core/tables/periodTables";
import "./PeriodScrollbar.css";

type Mark = { id: string; label: string; target: number; point: number };
type Geometry = { width: number; height: number; max: number; thumb: number; marks: Mark[] };

/** Occupies the existing horizontal scrollbar gutter, without taking table space. */
export function PeriodScrollFrame({ container, label, layoutKey, children }: {
  container: RefObject<HTMLDivElement | null>; label: string; layoutKey: string; children: ReactNode;
}) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [left, setLeft] = useState(0);
  const latestLeft = useRef(0);
  const [pointer, setPointer] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; left: number } | null>(null);
  const moved = useRef(false);

  useLayoutEffect(() => {
    const region = container.current, table = region?.querySelector("table");
    if (!region || !table) return;
    const sync = () => {
      if (latestLeft.current === region.scrollLeft) return;
      latestLeft.current = region.scrollLeft; setLeft(region.scrollLeft);
    };
    const measure = () => {
      const headers = [...table.querySelectorAll<HTMLElement>("thead [data-table-period]")];
      const first = headers[0];
      if (!first) { setGeometry(null); return; }
      const width = region.clientWidth, max = Math.max(0, region.scrollWidth - width);
      const origin = region.getBoundingClientRect().left;
      const fixed = first.getBoundingClientRect().left - origin + region.scrollLeft;
      const contentWidth = Math.max(1, region.scrollWidth - fixed);
      const thumb = Math.min(width, Math.max(24, width * width / region.scrollWidth));
      const marks = headers.flatMap(header => {
        const period = tablePeriods.find(period => period.id === header.dataset.tablePeriod);
        if (!period || period.months.length === 1) return [];
        const offset = header.getBoundingClientRect().left - origin + region.scrollLeft - fixed;
        return [{ id: period.id, label: period.label, target: Math.min(max, Math.max(0, offset)),
          point: Math.max(0, Math.min(width, offset / contentWidth * width)) }];
      });
      const next = { width, height: region.offsetHeight - region.clientHeight, max, thumb, marks };
      setGeometry(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      sync();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(region); observer.observe(table); measure();
    region.addEventListener("scroll", sync, { passive: true });
    const cancel = () => { drag.current = null; };
    window.addEventListener("blur", cancel);
    return () => {
      observer.disconnect(); region.removeEventListener("scroll", sync); window.removeEventListener("blur", cancel);
    };
  }, [container, layoutKey]);

  useLayoutEffect(() => {
    if (!geometry) return;
    const next = Object.fromEntries([...buttons.current].map(([id, button]) => [id, button.getBoundingClientRect().width]));
    setWidths(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, [geometry]);

  const placements = useMemo(() => {
    if (!geometry) return [];
    const entries = geometry.marks.map(mark => ({ ...mark, width: widths[mark.id] ?? mark.label.length * 11 + 6, left: 0 }));
    let visible = entries;
    if (entries.reduce((sum, mark) => sum + mark.width + 6, -6) > geometry.width) {
      visible = []; let used = 0;
      const near = pointer ?? geometry.thumb / 2 + (geometry.max ? left / geometry.max : 0) * (geometry.width - geometry.thumb);
      for (const mark of [...entries].sort((a, b) => Math.abs(a.point - near) - Math.abs(b.point - near))) {
        if (used + mark.width + 6 > geometry.width) break;
        visible.push(mark); used += mark.width + 6;
      }
      visible.sort((a, b) => a.point - b.point);
    }
    let edge = 0;
    for (const mark of visible) { mark.left = Math.max(edge, Math.min(geometry.width - mark.width, mark.point - mark.width / 2)); edge = mark.left + mark.width + 6; }
    let right = geometry.width;
    for (const mark of [...visible].reverse()) { mark.left = Math.max(0, Math.min(mark.left, right - mark.width)); right = mark.left - 6; }
    const visibleIds = new Set(visible.map(mark => mark.id));
    return entries.map(mark => ({ ...mark, visible: visibleIds.has(mark.id) }));
  }, [geometry, widths, pointer, left]);

  const stopMotion = () => {
    const region = container.current;
    if (region) region.scrollTo({ left: region.scrollLeft, behavior: "instant" });
  };
  const nearest = geometry?.marks.reduce<Mark | undefined>((best, mark) => !best || Math.abs(mark.target - left) < Math.abs(best.target - left) ? mark : best, undefined);
  return <div id={id} className="period-scroll-frame">
    {children}
    {geometry && geometry.max > 0 && geometry.height > 0 && <div ref={rail}
      className={`period-scrollbar${dismissed ? " period-scrollbar-dismissed" : ""}${touchOpen ? " period-scrollbar-touch" : ""}`}
      style={{ width: geometry.width, height: geometry.height, "--period-scroll-thumb": `${geometry.thumb}px` } as React.CSSProperties}
      onPointerEnter={() => setDismissed(false)} onPointerLeave={() => { setPointer(null); setDismissed(false); }}
      onPointerMove={event => {
        if (geometry.width < 400) setPointer(event.clientX - event.currentTarget.getBoundingClientRect().left);
      }}
      onFocusCapture={() => setDismissed(false)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTouchOpen(false); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); setDismissed(true); setTouchOpen(false); }
      }}>
      <input type="range" role="scrollbar" aria-label={`${label}の横スクロール`} aria-controls={id}
        aria-orientation="horizontal" aria-valuetext={nearest?.label} min={0} max={geometry.max} step={1}
        value={Math.min(left, geometry.max)} onPointerDown={event => { stopMotion(); if (event.pointerType === "touch") setTouchOpen(current => !current); }}
        onChange={event => { if (container.current) container.current.scrollLeft = Number(event.target.value); }} />
      <div className="period-scroll-marks" role="group" aria-label={`${label}の期間へ移動`}>
        {placements.map(mark => <button key={mark.id} type="button" className="period-scroll-mark"
          ref={button => { if (button) buttons.current.set(mark.id, button); else buttons.current.delete(mark.id); }}
          aria-label={`${mark.label}へ移動`} style={{ left: mark.left, visibility: mark.visible ? undefined : "hidden" }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            stopMotion(); moved.current = false;
            drag.current = { pointerId: event.pointerId, x: event.clientX, left: container.current?.scrollLeft ?? 0 };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const held = drag.current, region = container.current;
            if (!held || !region || held.pointerId !== event.pointerId || (!moved.current && Math.abs(event.clientX - held.x) < 4)) return;
            moved.current = true;
            region.scrollLeft = held.left + (event.clientX - held.x) / Math.max(1, geometry.width - geometry.thumb) * geometry.max;
          }}
          onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; moved.current = true; }}
          onClick={event => {
            if (event.detail > 0 && moved.current) { moved.current = false; return; }
            container.current?.scrollTo({ left: mark.target, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          }}>{mark.label}</button>)}
      </div>
    </div>}
  </div>;
}
