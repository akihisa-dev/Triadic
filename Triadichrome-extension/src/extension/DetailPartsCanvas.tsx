import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { arrangeParts, magnetPosition, PART_INITIAL, PART_STEP, TABLE_PART_MIN, resizePart, settlePart, stableSnapPosition, type DetailPart } from "../core/tables/detailParts";
import "./DetailPartsCanvas.css";
import { DetailImagePart } from "./DetailImagePart";
import { DetailTextPart } from "./DetailTextPart";
import { DetailTablePart } from "./DetailTablePart";
import { detailTableMonths, emptyDetailTable } from "../core/tables/detailTable";

function PartPreview({ kind }: { kind: DetailPart["kind"] }) {
  const horizontal = kind === "table-horizontal";
  const columns = horizontal ? 13 : 4, rows = horizontal ? 4 : 13;
  const width = 180 / columns, height = 96 / rows;
  return <svg className="detail-pool-preview" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
    {kind === "image" ? <g>
      <rect x="20" y="14" width="160" height="92" rx="4" className="detail-preview-paper" />
      <circle cx="135" cy="38" r="10" />
      <path d="M30 94L75 45L106 76L126 58L170 94Z" />
      <text x="100" y="113" textAnchor="middle" fontSize="10">画像</text>
    </g> : kind === "text" ? <text x="14" y="32" fontSize="12">
      <tspan x="14">施策についての説明文</tspan>
      <tspan x="14" dy="23">目的や考え方などを</tspan>
      <tspan x="14" dy="20">ここに記入します。</tspan>
    </text> : <g transform="translate(10 12)">
      <rect width="180" height="96" className="detail-preview-paper" />
      <rect width="180" height={height} className="detail-preview-header" />
      <rect width={width} height="96" className="detail-preview-header" />
      {Array.from({ length: columns + 1 }, (_, i) => <path key={`c${i}`} d={`M${i * width} 0V96`} />)}
      {Array.from({ length: rows + 1 }, (_, i) => <path key={`r${i}`} d={`M0 ${i * height}H180`} />)}
      <text x={width / 2} y={height / 2} dominantBaseline="central" textAnchor="middle" fontSize={horizontal ? 6 : 7}>{horizontal ? "項目" : "月"}</text>
      {detailTableMonths.map((month, i) => <text key={month.id} x={horizontal ? (i + 1.5) * width : width / 2}
        y={horizontal ? height / 2 : (i + 1.5) * height} dominantBaseline="central" textAnchor="middle" fontSize={horizontal ? 6 : 7}>{month.label}</text>)}
      {["A", "B", "C"].map((name, i) => <text key={name} x={horizontal ? width / 2 : (i + 1.5) * width}
        y={horizontal ? (i + 1.5) * height : height / 2} dominantBaseline="central" textAnchor="middle" fontSize="7">{name}</text>)}
    </g>}
  </svg>;
}

function newPart(kind: DetailPart["kind"]): DetailPart {
  const base = { id: crypto.randomUUID(), x: 0, y: 0 };
  return kind === "image" ? { ...base, width: 336, height: 240, kind, src: "", name: "" } : kind === "text" ? { ...base, ...PART_INITIAL, kind, text: "" }
    : { ...base, ...TABLE_PART_MIN[kind], kind, cells: emptyDetailTable() };
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [destination, setDestination] = useState<DetailPart | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
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
    if (g.pool) active = { ...g.origin, x: Math.max(0, g.clientX - rect.left + element.scrollLeft - g.origin.width / 2),
      y: Math.max(0, g.clientY - rect.top + element.scrollTop - g.origin.height / 2) };
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
      return { x: g.clientX, y: g.clientY, width: g.origin.width, height: g.origin.height };
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
  useEffect(() => { if (disabled) { endRef.current(false); setEditingId(null); } }, [disabled]);

  function start(event: ReactPointerEvent<HTMLElement>, part?: DetailPart, resizing = false, kind: DetailPart["kind"] = "text") {
    if (disabled || gesture.current || (part && editingId === part.id) || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const element = viewport.current!;
    const origin = part ?? newPart(kind);
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
  function editPart(id: string, update: (part: DetailPart) => DetailPart) {
    if (latest.current.disabled) return;
    const apply = (part: DetailPart) => part.id === id ? update(part) : part;
    // A completed image read may arrive during a drag. Retain it in both the saved base and the gesture.
    const moving = gesture.current;
    if (moving) {
      moving.base = moving.base.map(apply);
      moving.origin = apply(moving.origin); moving.current = apply(moving.current);
      if (moving.destination) moving.destination = apply(moving.destination);
      moving.signature = "";
    }
    latest.current.onChange(latest.current.parts.map(apply));
  }
  const width = Math.max(size.width * 2, 1200, ...display.map(part => part.x + part.width + size.width));
  const height = Math.max(size.height * 2, 900, ...display.map(part => part.y + part.height + size.height));
  return <div className="detail-workspace">
    <div ref={viewport} className="detail-canvas-viewport" role="region" aria-label="パーツの編集領域" tabIndex={0}>
      <div className="detail-canvas" style={{ width, height }}>
        {destination && <div className="detail-part-destination" aria-hidden="true"
          style={{ width: destination.width, height: destination.height, transform: `translate3d(${destination.x}px, ${destination.y}px, 0)` }} />}
        {display.map((part, index) => <div key={part.id} className={`detail-part${dragging === part.id ? " is-dragging" : ""}${editingId === part.id ? " is-editing" : ""}`}
          style={{ width: part.width, height: part.height, transform: `translate3d(${part.x}px, ${part.y}px, 0)` }}
          role="group" aria-label={`パーツ ${index + 1}`} tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
          onPointerDown={event => start(event, part)}
          onDoubleClick={event => {
            // Pointer capture targets the group when a double-click follows a move gesture.
            if (!disabled && event.target === event.currentTarget) setEditingId(part.id);
          }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || disabled) return;
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(part.id); }
            const dx = event.key === "ArrowRight" ? PART_STEP : event.key === "ArrowLeft" ? -PART_STEP : 0;
            const dy = event.key === "ArrowDown" ? PART_STEP : event.key === "ArrowUp" ? -PART_STEP : 0;
            if (dx || dy) { event.preventDefault(); change({ ...part, x: Math.max(0, part.x + dx), y: Math.max(0, part.y + dy) }); }
          }}>
          {part.kind === "image" ? <DetailImagePart src={part.src} name={part.name} disabled={disabled} index={index} editing={editingId === part.id}
            onEditingChange={editing => setEditingId(editing ? part.id : null)}
            onChange={image => editPart(part.id, current => current.kind === "image" ? { ...current, ...image } : current)} />
            : part.kind !== "text" ? <DetailTablePart cells={part.cells} horizontal={part.kind === "table-horizontal"} disabled={disabled} index={index} editing={editingId === part.id}
            onEditingChange={editing => setEditingId(editing ? part.id : null)}
            onChange={cells => editPart(part.id, current => (current.kind === "table-horizontal" || current.kind === "table-vertical") ? { ...current, cells } : current)} />
            : <DetailTextPart text={part.text} disabled={disabled} index={index} editing={editingId === part.id}
              onEditingChange={editing => setEditingId(editing ? part.id : null)}
              onChange={text => editPart(part.id, current => current.kind === "text" ? { ...current, text } : current)} />}
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
      {(["text", "table-horizontal", "table-vertical", "image"] as const).map(kind => <button key={kind} type="button" className="detail-pool-source" aria-label={`${kind === "image" ? "画像" : kind === "text" ? "テキスト" : kind === "table-horizontal" ? "横向き12か月" : "縦向き12か月"}パーツを追加`} disabled={disabled} onPointerDown={event => start(event, undefined, false, kind)}
        onKeyDown={event => {
          if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          change({ ...newPart(kind), x: viewport.current!.scrollLeft + 16, y: viewport.current!.scrollTop + 16 });
        }}><PartPreview kind={kind} /></button>)}
    </aside>
    {ghost && createPortal(<div className="detail-part-ghost" style={{ left: ghost.x - ghost.width / 2, top: ghost.y - ghost.height / 2, width: ghost.width, height: ghost.height }} />, document.body)}
  </div>;
}
