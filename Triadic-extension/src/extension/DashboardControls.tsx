import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { initiativeMonths } from "../core/domain/calendar";
import type { BudgetPrevious, KindId } from "../core/domain/kinds";
import type { DashboardPeriod } from "../core/tables/dashboard";
import { ComparisonSelection } from "./ComparisonSelection";

type Props = { selected: KindId[]; previous: BudgetPrevious; disabled: boolean; period: DashboardPeriod;
  onSelection: (kinds: KindId[], previous: BudgetPrevious) => void; onPeriod: (period: DashboardPeriod) => void };

export function DashboardControls({ selected, previous, disabled, period, onSelection, onPeriod }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const bodyId = useId();
  const visible = open || pinned;
  function move(x: number, y: number) {
    const box = panel.current!.getBoundingClientRect();
    setOffset(current => ({ x: current.x + Math.min(innerWidth - 8 - box.right, Math.max(8 - box.left, x - current.x)),
      y: current.y + Math.min(innerHeight - 8 - box.bottom, Math.max(72 - box.top, y - current.y)) }));
  }
  useLayoutEffect(() => { move(offset.x, offset.y); }, [visible, period]);
  useEffect(() => {
    const resize = () => setOffset({ x: 0, y: 0 });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<aside ref={panel} className="dashboard-floating-controls" aria-label="表示条件" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!panel.current?.contains(document.activeElement)) setOpen(false); }}
    onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); trigger.current?.focus(); setPinned(false); setOpen(false); } }}>
    <div id={bodyId} className="dashboard-floating-body" hidden={!visible}>
      <ComparisonSelection selected={selected} previous={previous} disabled={disabled} onChange={onSelection} />
      <div className="dashboard-period-buttons" role="group" aria-label="対象期間">{(["annual", ...initiativeMonths] as const).map(month =>
        <button key={month} disabled={disabled} aria-pressed={period === month} onClick={() => onPeriod(month)}>{month === "annual" ? "年間" : `${month}月`}</button>)}</div>
      <p>月の選択は部署別比較・施策の影響に反映</p>
    </div>
    {period !== "annual" && <div className="dashboard-floating-active"><button disabled={disabled} onClick={() => onPeriod("annual")}>年間に戻す</button></div>}
    <div className="dashboard-floating-head">
      <button className="dashboard-drag-handle" aria-label="表示条件パネルを移動"
        onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (drag.current) move(drag.current.ox + event.clientX - drag.current.x, drag.current.oy + event.clientY - drag.current.y); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={event => { const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
          if (delta) { event.preventDefault(); const step = event.shiftKey ? 40 : 10; move(offset.x + delta[0]! * step, offset.y + delta[1]! * step); } }}>移動</button>
      <button ref={trigger} className="dashboard-floating-trigger" aria-expanded={visible} aria-controls={bodyId}
        onClick={() => { setPinned(!pinned); setOpen(!pinned); }}>表示条件<span>{period === "annual" ? "年間" : `${period}月`} · {selected.map(kind => kind === 1 ? "一次予算" : "確定予算").join("・")}</span></button>
      <button className="dashboard-pin-control" aria-pressed={pinned} onClick={() => setPinned(value => !value)}>{pinned ? "固定中" : "固定"}</button>
    </div>
  </aside>, document.body);
}
