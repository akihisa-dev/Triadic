import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { layoutExpansionScrollMarks, type ExpansionScrollFocus, type ExpansionScrollMark } from "./expansionScrollLayout";
import "./ExpansionScrollbar.css";

export const expansionScrollRegionId = "expansion-table-scroll-region";
export type ExpansionScrollTarget = { id: number; name: string; index: number };
type Geometry = { height: number; width: number; max: number; thumb: number; marks: ExpansionScrollMark[] };
type Press = { pointerId: number; y: number; top: number; markId: number; moved: boolean };

/** Uses the existing gutter; virtual groups retain their full row indices. */
export function ExpansionScrollbar({ container, targets, virtual }: {
  container: RefObject<HTMLDivElement | null>; targets: ExpansionScrollTarget[]; virtual: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [top, setTop] = useState(0);
  const latestTop = useRef(0);
  const [windowPoint, setWindowPoint] = useState<number | null>(null);
  const [active, setActive] = useState<ExpansionScrollFocus>(null);
  const activeRef = useRef<ExpansionScrollFocus>(null);
  const [dismissed, setDismissed] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const press = useRef<Press | null>(null);
  const clearActive = () => { activeRef.current = null; setActive(null); };
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
          nameSize: Math.min(height, Math.max(18, [...item.name].length * 11 + 6), Math.max(18, height / 2)) };
      });
      const next = { height, width: region.offsetWidth - region.clientWidth, max,
        thumb: Math.min(height, Math.max(24, height * height / region.scrollHeight)), marks };
      setGeometry(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); sync();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(region); observer.observe(table); measure();
    region.addEventListener("scroll", sync, { passive: true });
    const cancel = () => { press.current = null; };
    window.addEventListener("blur", cancel);
    return () => { observer.disconnect(); region.removeEventListener("scroll", sync); window.removeEventListener("blur", cancel); press.current = null; };
  }, [container, targets, virtual]);
  const near = windowPoint ?? (geometry ? geometry.thumb / 2 + (geometry.max ? top / geometry.max : 0) * (geometry.height - geometry.thumb) : 0);
  const placements = useMemo(() => geometry ? layoutExpansionScrollMarks(geometry.marks, geometry.height, near, active) : [], [geometry, near, active]);
  if (!geometry || geometry.max <= 0 || geometry.width <= 0 || geometry.height <= 0) return null;
  const activate = (id: number, anchor: number) => {
    if (activeRef.current?.id === id) return;
    if (windowPoint === null) setWindowPoint(near);
    const next = { id, anchor }; activeRef.current = next; setActive(next);
  };
  const stopMotion = () => { const region = container.current; if (region) region.scrollTo({ top: region.scrollTop, behavior: "instant" }); };
  const jump = (id: number) => {
    const region = container.current, mark = geometry.marks.find(mark => mark.id === id);
    if (!region || !mark) return;
    let target = mark.target;
    if (!virtual) {
      const row = region.querySelector<HTMLElement>(`tr[data-expansion-start="${id}"]`);
      const header = region.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      if (row) target = row.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop - header;
    }
    region.scrollTo({ top: Math.max(0, Math.min(region.scrollHeight - region.clientHeight, target)),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div ref={rail} className={`expansion-scrollbar${dismissed ? " expansion-scrollbar-dismissed" : ""}${touchOpen ? " expansion-scrollbar-touch" : ""}`}
    style={{ height: geometry.height, width: geometry.width, "--expansion-scroll-thumb": `${geometry.thumb}px` } as React.CSSProperties}
    onPointerEnter={event => { setDismissed(false); if (!activeRef.current) setWindowPoint(event.clientY - event.currentTarget.getBoundingClientRect().top); }}
    onPointerLeave={() => {
      if (!press.current && !(rail.current?.contains(document.activeElement) && document.activeElement?.matches(":focus-visible"))) { clearActive(); setWindowPoint(null); }
      setDismissed(false);
    }}
    onPointerMove={event => {
      if (press.current || event.buttons) return;
      const held = activeRef.current && buttons.current.get(activeRef.current.id)?.getBoundingClientRect();
      if (held && event.clientY >= held.top && event.clientY <= held.bottom) return;
      const hit = [...buttons.current].find(([, button]) => { const rect = button.getBoundingClientRect(); return event.clientY >= rect.top && event.clientY <= rect.bottom; });
      const point = event.clientY - event.currentTarget.getBoundingClientRect().top;
      if (hit) activate(hit[0], point);
      else { clearActive(); setWindowPoint(point); }
    }}
    onFocusCapture={() => setDismissed(false)}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setTouchOpen(false); if (!event.currentTarget.matches(":hover")) { clearActive(); setWindowPoint(null); } }
    }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setDismissed(true); setTouchOpen(false); clearActive(); } }}>
    <input type="range" role="scrollbar" aria-label="展開表の縦スクロール" aria-controls={expansionScrollRegionId} aria-orientation="vertical"
      min={0} max={geometry.max} step={1} value={Math.min(top, geometry.max)}
      onPointerDown={event => { stopMotion(); clearActive(); if (event.pointerType === "touch") setTouchOpen(value => !value); }}
      onChange={event => { if (container.current) container.current.scrollTop = Number(event.target.value); }} />
    <div className="expansion-scroll-marks" role="group" aria-label="展開名へ移動">
      {placements.map(mark => <button key={mark.id} type="button"
        ref={button => { if (button) buttons.current.set(mark.id, button); else buttons.current.delete(mark.id); }}
        className={`expansion-scroll-mark${!mark.dense ? " expansion-scroll-full-name" : ""}${mark.expanded ? " expansion-scroll-expanded" : ""}`}
        data-expansion-id={mark.id} data-dense={mark.dense} data-long-id={String(mark.id).length > 2}
        aria-label={`${mark.name}の先頭へ移動`} aria-description={`展開ID ${mark.id}`} aria-expanded={mark.dense ? mark.expanded : undefined}
        style={{ top: mark.position, height: mark.size }}
        onFocus={event => { const rect = event.currentTarget.getBoundingClientRect(); activate(mark.id, rect.top + rect.height / 2 - rail.current!.getBoundingClientRect().top); }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); stopMotion();
          activate(mark.id, event.clientY - rail.current!.getBoundingClientRect().top);
          press.current = { pointerId: event.pointerId, y: event.clientY, top: container.current?.scrollTop ?? 0, markId: mark.id, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true });
        }}
        onPointerMove={event => {
          const held = press.current, region = container.current;
          if (!held || !region || held.pointerId !== event.pointerId || (!held.moved && Math.abs(event.clientY - held.y) < 4)) return;
          held.moved = true;
          region.scrollTop = held.top + (event.clientY - held.y) / Math.max(1, geometry.height - geometry.thumb) * geometry.max;
        }}
        onPointerUp={event => {
          const held = press.current;
          if (!held || held.pointerId !== event.pointerId) return;
          press.current = null; if (!held.moved) jump(held.markId);
        }}
        onLostPointerCapture={() => { press.current = null; }} onPointerCancel={() => { press.current = null; }}
        onClick={event => { if (event.detail === 0) jump(mark.id); }}>
        <span className="expansion-scroll-id" aria-hidden="true">{mark.id}</span>
        <span className="expansion-scroll-name" aria-hidden="true">{mark.name}</span>
      </button>)}
    </div>
  </div>;
}
