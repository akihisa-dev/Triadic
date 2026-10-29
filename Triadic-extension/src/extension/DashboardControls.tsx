import { createPortal } from "react-dom";
import { useId, useRef, useState } from "react";
import { initiativeMonths } from "../core/domain/calendar";
import type { BudgetPrevious, KindId } from "../core/domain/kinds";
import type { DashboardPeriod } from "../core/tables/dashboard";
import { ComparisonSelection } from "./ComparisonSelection";

type Props = { selected: KindId[]; previous: BudgetPrevious; disabled: boolean; period: DashboardPeriod;
  onSelection: (kinds: KindId[], previous: BudgetPrevious) => void; onPeriod: (period: DashboardPeriod) => void };

export function DashboardControls({ selected, previous, disabled, period, onSelection, onPeriod }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  if (typeof document === "undefined") return null;
  return createPortal(<aside ref={panel} className="dashboard-floating-controls" aria-label="表示条件"
    onPointerEnter={event => { if (event.pointerType === "mouse") setOpen(true); }} onPointerLeave={() => { if (!panel.current?.contains(document.activeElement)) setOpen(false); }}
    onFocus={event => { if (event.target !== trigger.current) setOpen(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); trigger.current?.focus(); setOpen(false); } }}>
    <div id={bodyId} className="dashboard-floating-body" hidden={!open}>
      <ComparisonSelection selected={selected} previous={previous} disabled={disabled} onChange={onSelection} />
      <div className="dashboard-period-buttons" role="group" aria-label="対象期間">{(["annual", ...initiativeMonths] as const).map(month =>
        <button key={month} disabled={disabled} aria-pressed={period === month} onClick={() => onPeriod(month)}>{month === "annual" ? "年間" : `${month}月`}</button>)}</div>
    </div>
    <div className="dashboard-floating-head">
      <button ref={trigger} className="dashboard-floating-trigger" aria-expanded={open} aria-controls={bodyId}
        onClick={() => setOpen(true)}>表示条件<span>{period === "annual" ? "年間" : `${period}月`} · {selected.map(kind => kind === 1 ? "一次予算" : "確定予算").join("・")}</span></button>
    </div>
  </aside>, document.body);
}
