import { yenToAmount } from "../core/domain/amounts";
import type { SelectionTotal } from "../core/tables/selectionTotal";
import "./GridSelectionTotal.css";

export function GridSelectionTotal({ total, accountsOnly = false, compact = false }: { total: SelectionTotal; accountsOnly?: boolean; compact?: boolean }) {
  return <div className={`grid-selection-total${compact ? " grid-selection-total-compact" : ""}`} role="status" aria-live="polite" aria-atomic="true">
    {total && (total.error ? compact ? "計算できません" : total.error : <><span>選択範囲の合計{accountsOnly ? "（科目のみ）" : ""}</span><strong>{yenToAmount(total.amount!)}</strong></>)}
  </div>;
}
