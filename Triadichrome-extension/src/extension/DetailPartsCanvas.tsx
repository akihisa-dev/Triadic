import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { arrangeParts, magnetPosition, PART_INITIAL, PART_STEP, resizePart, settlePart, stableSnapPosition, type DetailPart } from "../core/tables/detailParts";
import "./DetailPartsCanvas.css";

type Props = { parts: DetailPart[]; disabled: boolean; onChange: (parts: DetailPart[]) => void };
type Gesture = {
  pointerId: number; source: HTMLElement; origin: DetailPart; base: DetailPart[]; resizing: boolean;
  pool: boolean; startX: number; startY: number; scrollX: number; scrollY: number;
  clientX: number; clientY: number; valid: boolean; current: DetailPart; signature: string; time: number;
  destination: DetailPart | null;
};

export function DetailPartsCanvas({ parts, disabled, onChange }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const latest = useRef({ parts, disabled, onChange });
  latest.current = { parts, disabled, onChange };
  const [display, setDisplay] = useState(parts);
  const [dragging, setDragging] = useState<string | null>(null);
  const [destination, setDestination] = useState<DetailPart | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!gesture.current) setDisplay(parts);
  }, [parts]);
  useLayoutEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function draw(time: number, scroll = true) {
    const g = gesture.current, element = viewport.current;
    if (!g || !element) return;
    const rect = element.getBoundingClientRect();
    const inside = g.clientX >= rect.left && g.clientX < rect.right && g.clientY >= rect.top && g.clientY < rect.bottom;
    g.valid = inside;
    const elapsed = Math.min(32, Math.max(0, time - g.time)) / 1000;
    g.time = time;
    if (scroll && inside) {
      const velocity = (position: number, start: number, end: number) => position < start + 56
        ? -900 * Math.min(1, (start + 56 - position) / 56) ** 2
        : position > end - 56 ? 900 * Math.min(1, (position - end + 56) / 56) ** 2 : 0;
      element.scrollLeft += velocity(g.clientX, rect.left, rect.right) * elapsed;
      element.scrollTop += velocity(g.clientY, rect.top, rect.bottom) * elapsed;
    }
    let active: DetailPart;
    if (g.pool) active = { ...g.origin, x: Math.max(0, g.clientX - rect.left + element.scrollLeft - PART_INITIAL.width / 2),
      y: Math.max(0, g.clientY - rect.top + element.scrollTop - PART_INITIAL.height / 2) };
    else {
      const dx = g.clientX - g.startX + element.scrollLeft - g.scrollX;
      const dy = g.clientY - g.startY + element.scrollTop - g.scrollY;
      active = g.resizing ? resizePart(g.origin, dx, dy)
        : { ...g.origin, x: Math.max(0, g.origin.x + dx), y: Math.max(0, g.origin.y + dy) };
    }
    if (inside && !g.resizing) {
      const previous = g.destination ?? (g.pool ? null : settlePart(g.origin));
      const x = stableSnapPosition(active.x, previous?.x);
      const y = stableSnapPosition(active.y, previous?.y);
      if (!g.destination || g.destination.x !== x || g.destination.y !== y) {
        g.destination = { ...settlePart(active), x, y };
        setDestination(g.destination);
      }
    } else if (g.destination) {
      g.destination = null;
      setDestination(null);
    }
    if (!g.resizing) active = { ...active, x: magnetPosition(active.x), y: magnetPosition(active.y) };
    g.current = active;
    const signature = `${active.x}:${active.y}:${active.width}:${active.height}:${inside}`;
    if (signature !== g.signature) {
      g.signature = signature;
      setDisplay(inside ? arrangeParts(g.base, active) : g.base);
    }
    setGhost(previous => {
      if (!g.pool || inside) return previous === null ? previous : null;
      if (previous?.x === g.clientX && previous.y === g.clientY) return previous;
      return { x: g.clientX, y: g.clientY };
    });
  }

  function end(commit: boolean) {
    const g = gesture.current;
    if (!g) return;
    draw(performance.now(), false);
    cancelAnimationFrame(frame.current);
    const result = commit && g.valid && !latest.current.disabled ? arrangeParts(g.base, g.destination ?? g.current, true) : latest.current.parts;
    gesture.current = null;
    setDragging(null); setGhost(null); setDestination(null); setDisplay(result);
    if (g.source.hasPointerCapture(g.pointerId)) g.source.releasePointerCapture(g.pointerId);
    if (commit && g.valid && !latest.current.disabled) latest.current.onChange(result);
  }
  const endRef = useRef(end); endRef.current = end;
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = gesture.current;
      if (g && g.pointerId === event.pointerId) { g.clientX = event.clientX; g.clientY = event.clientY; event.preventDefault(); }
    };
    const up = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      g.clientX = event.clientX; g.clientY = event.clientY; endRef.current(true);
    };
    const cancel = (event: PointerEvent) => { if (gesture.current?.pointerId === event.pointerId) endRef.current(false); };
    const key = (event: KeyboardEvent) => {
      if (gesture.current && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); endRef.current(false); }
    };
    const blur = () => endRef.current(false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true); window.addEventListener("blur", blur);
    return () => {
      cancelAnimationFrame(frame.current); gesture.current = null;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => { if (disabled) endRef.current(false); }, [disabled]);

  function start(event: ReactPointerEvent<HTMLElement>, part?: DetailPart, resizing = false) {
    if (disabled || gesture.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const element = viewport.current!;
    const origin = part ?? { id: crypto.randomUUID(), x: 0, y: 0, ...PART_INITIAL };
    gesture.current = { pointerId: event.pointerId, source: event.currentTarget, origin, base: latest.current.parts,
      resizing, pool: !part, startX: event.clientX, startY: event.clientY,
      scrollX: element.scrollLeft, scrollY: element.scrollTop, clientX: event.clientX, clientY: event.clientY,
      valid: false, current: origin, destination: null, signature: "", time: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(origin.id);
    const tick = (time: number) => { if (!gesture.current) return; draw(time); frame.current = requestAnimationFrame(tick); };
    frame.current = requestAnimationFrame(tick);
  }
  function change(part: DetailPart) {
    if (!disabled && !gesture.current) latest.current.onChange(arrangeParts(parts, part, true));
  }
  function remove(id: string) {
    if (!disabled && !gesture.current) latest.current.onChange(parts.filter(part => part.id !== id));
  }
  const width = Math.max(size.width * 2, 1200, ...display.map(part => part.x + part.width + size.width));
  const height = Math.max(size.height * 2, 900, ...display.map(part => part.y + part.height + size.height));
  return <div className="detail-workspace">
    <div ref={viewport} className="detail-canvas-viewport" role="region" aria-label="パーツの編集領域" tabIndex={0}>
      <div className="detail-canvas" style={{ width, height }}>
        {destination && <div className="detail-part-destination" aria-hidden="true"
          style={{ width: destination.width, height: destination.height, transform: `translate3d(${destination.x}px, ${destination.y}px, 0)` }} />}
        {display.map((part, index) => <div key={part.id} className={`detail-part${dragging === part.id ? " is-dragging" : ""}`}
          style={{ width: part.width, height: part.height, transform: `translate3d(${part.x}px, ${part.y}px, 0)` }}
          role="group" aria-label={`パーツ ${index + 1}`} tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
          onPointerDown={event => start(event, part)}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || disabled) return;
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(part.id); }
            const dx = event.key === "ArrowRight" ? PART_STEP : event.key === "ArrowLeft" ? -PART_STEP : 0;
            const dy = event.key === "ArrowDown" ? PART_STEP : event.key === "ArrowUp" ? -PART_STEP : 0;
            if (dx || dy) { event.preventDefault(); change({ ...part, x: Math.max(0, part.x + dx), y: Math.max(0, part.y + dy) }); }
          }}>
          <button type="button" className="detail-part-grip" disabled={disabled}
            aria-label={`パーツ ${index + 1}の右下でサイズ変更`} onPointerDown={event => start(event, part, true)}
            onKeyDown={event => {
              const dx = event.key === "ArrowRight" ? PART_STEP : event.key === "ArrowLeft" ? -PART_STEP : 0;
              const dy = event.key === "ArrowDown" ? PART_STEP : event.key === "ArrowUp" ? -PART_STEP : 0;
              if (dx || dy) { event.preventDefault(); event.stopPropagation(); change(settlePart(resizePart(part, dx, dy))); }
            }} />
          <button type="button" className="detail-part-delete" disabled={disabled} aria-label={`パーツ ${index + 1}を削除`}
            onPointerDown={event => event.stopPropagation()} onClick={() => remove(part.id)}>×</button>
        </div>)}
      </div>
    </div>
    <aside className="detail-part-pool" aria-label="パーツプール">
      <h2>パーツプール</h2>
      <button type="button" className="detail-pool-source" aria-label="空のパーツを追加" disabled={disabled} onPointerDown={event => start(event)}
        onKeyDown={event => {
          if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          change({ id: crypto.randomUUID(), x: viewport.current!.scrollLeft + 16, y: viewport.current!.scrollTop + 16, ...PART_INITIAL });
        }} />
    </aside>
    {ghost && createPortal(<div className="detail-part-ghost" style={{ left: ghost.x - 80, top: ghost.y - 48, ...PART_INITIAL }} />, document.body)}
  </div>;
}
