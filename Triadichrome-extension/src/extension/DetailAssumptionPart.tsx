import { useLayoutEffect, useRef } from "react";
import type { DetailPart } from "../core/tables/detailParts";

type Assumption = Pick<Extract<DetailPart, { kind: "assumption" }>, "label" | "value" | "unit">;
const fields = [["label", "項目名"], ["value", "値"], ["unit", "単位"]] as const;

export function DetailAssumptionPart({ assumption, disabled, index, editing, onEditingChange, onChange }: {
  assumption: Assumption; disabled: boolean; index: number; editing: boolean;
  onEditingChange: (editing: boolean) => void; onChange: (value: Assumption) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (editing) input.current?.focus({ preventScroll: true }); }, [editing]);
  return editing && !disabled ? <div className="detail-assumption-editor"
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onEditingChange(false); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault(); onEditingChange(false);
        requestAnimationFrame(() => view.current?.focus({ preventScroll: true }));
      }
    }}>
    {fields.map(([key, label], position) => <label key={key}>{label}<input ref={position === 0 ? input : undefined}
      aria-label={`パーツ ${index + 1}の${label}`} value={assumption[key]}
      onChange={event => onChange({ label: assumption.label, value: assumption.value, unit: assumption.unit, [key]: event.target.value })} /></label>)}
  </div> : <div ref={view} className="detail-assumption-view" role="button" tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled} aria-label={`パーツ ${index + 1}の前提条件を編集`}
    onDoubleClick={event => { event.stopPropagation(); if (!disabled) onEditingChange(true); }}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation(); if (!disabled) onEditingChange(true);
      }
    }}>
    {fields.map(([key, label]) => <span key={key} className={assumption[key] ? "" : "is-empty"}>{assumption[key] || label}</span>)}
  </div>;
}
