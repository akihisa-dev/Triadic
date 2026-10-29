import { Fragment } from "react";
import { kindIds, previousKindName, toggleComparison, type BudgetPrevious, type KindId } from "../core/domain/kinds";
import "./ComparisonSelection.css";

export function ComparisonSelection({ selected, previous, disabled = false, independentPrevious = false, phase = null, onChange }: {
  selected: KindId[]; previous: BudgetPrevious; disabled?: boolean; independentPrevious?: boolean; phase?: KindId | null;
  onChange: (selected: KindId[], previous: BudgetPrevious) => void;
}) {
  if (phase !== null) return <div role="group" aria-label="予算の比較条件" className="phase-comparison-selection">
    {independentPrevious && <span>{phase === 1 ? "前年見込" : "前年実績"}</span>}
    {(phase === 1 ? [1] as KindId[] : [1, 2] as KindId[]).map(kind => <label key={kind}>
      <input type="checkbox" aria-label={`${kind === 1 ? "一次予算" : "確定予算"}を表示`} checked={selected.includes(kind)} disabled={disabled || phase === 1}
        onChange={() => { const next = selected.includes(kind) ? selected.filter(value => value !== kind) : [...selected, kind].sort() as KindId[];
          if (next.length) onChange(next, { 1: 1, 2: 2, display: phase }); }} />
      {kind === 1 ? "一次予算" : "確定予算"}
    </label>)}
  </div>;
  return <div className={`comparison-selection${independentPrevious ? " comparison-selection-independent" : ""}`} role="group" aria-label="予算の比較条件">
    <span aria-hidden="true" />{independentPrevious && <span>前年</span>}<span>一次予算</span><span>確定予算</span>
    {kindIds.map(baseline => <Fragment key={baseline}>
      <span className="comparison-baseline">{previousKindName(baseline)}</span>
      {independentPrevious && <label className="comparison-cell">
        <input type="checkbox" aria-label={`前年列に${previousKindName(baseline)}を表示`}
          checked={(previous.display ?? 1) === baseline} disabled={disabled}
          onChange={() => { if ((previous.display ?? 1) !== baseline) onChange(selected, { ...previous, display: baseline }); }} />
      </label>}
      {kindIds.map(kind => <label key={kind} className="comparison-cell">
        <input type="checkbox" aria-label={`${previousKindName(baseline)}を基準にした${kind === 1 ? "一次予算" : "確定予算"}`}
          checked={selected.includes(kind) && previous[kind] === baseline} disabled={disabled}
          onChange={() => { const next = toggleComparison(selected, previous, kind, baseline); onChange(next.selected, next.previous); }} />
      </label>)}
    </Fragment>)}
  </div>;
}
