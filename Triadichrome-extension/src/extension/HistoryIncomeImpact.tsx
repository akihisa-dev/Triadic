import { amountItems } from "../core/domain/amountItems";
import { yenToAmount } from "../core/domain/amounts";
import type { HistoryIncomeImpact, HistoryIncomeValue } from "../core/domain/historyDifference";

const text = (value: HistoryIncomeValue, signed = false) => value.error ?? `${signed && value.yen! > 0 ? "+" : ""}${yenToAmount(value.yen!)}`;
export function HistoryIncomeImpactTable({ impact, kind, period, onKindChange, onPeriodChange }: {
  impact: HistoryIncomeImpact[]; kind: number; period: string; onKindChange: (kind: number) => void; onPeriodChange: (period: string) => void;
}) {
  const rows = impact.filter(item => item.kind === kind && (period === "year" ? item.period === "year" : item.period !== "year"));
  return <>
    <div className="history-difference-controls">
      <label>予算種別<select value={kind} onChange={event => onKindChange(Number(event.target.value))}><option value={1}>一次予算</option><option value={2}>確定予算</option></select></label>
      <label>表示期間<select value={period} onChange={event => onPeriodChange(event.target.value)}><option value="year">年間</option><option value="months">月別</option></select></label>
    </div>
    <div className="history-difference-scroll history-income-scroll"><table aria-label="履歴と現在の収支への影響"><thead><tr>{["期間", "項目", "履歴の値", "現在の値", "増減"].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.period}:${row.metric}`}><th scope="row">{row.period === "year" ? "年間" : `${row.period}月`}</th><td>{amountItems.find(item => item.id === row.metric)!.name}</td>
        <td>{text(row.before)}</td><td>{text(row.after)}</td><td>{text(row.difference, true)}</td></tr>)}</tbody></table></div>
    {rows.some(row => row.before.error || row.after.error || row.difference.error) && <p role="status">「範囲超過」は正確に表示できる金額の上限を超えています。ほかの値と変更項目は引き続き確認できます。</p>}
  </>;
}
