import { Fragment } from "react";
import { kindIds, previousKindName, toggleComparison, type BudgetPrevious, type KindId } from "../core/domain/kinds";
import "./ComparisonSelection.css";

export function ComparisonSelection({ selected, previous, disabled = false, independentPrevious = false, onChange }: {
  selected: KindId[]; previous: BudgetPrevious; disabled?: boolean; independentPrevious?: boolean;
  onChange: (selected: KindId[], previous: BudgetPrevious) => void;
}) {
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
