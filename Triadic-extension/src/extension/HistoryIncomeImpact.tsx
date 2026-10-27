import { ComparisonSelection } from "./ComparisonSelection";
import { comparisonName, type KindId, type BudgetPrevious } from "../core/domain/kinds";
import { TableViewHeader, TableViewEmpty, useTableView } from "./TableViewHeader";
import type { TableColumn } from "../core/tables/columnView";
import { amountItems } from "../core/domain/amountItems";
import { yenToAmount } from "../core/domain/amounts";
import type { HistoryIncomeImpact, HistoryIncomeValue } from "../core/domain/historyDifference";

const text = (value: HistoryIncomeValue, signed = false) => value.error ?? `${signed && value.yen! > 0 ? "+" : ""}${yenToAmount(value.yen!)}`;
export function HistoryIncomeImpactTable({ impact, previous, selected, onSelection, period, onPeriodChange }: {
  previous: BudgetPrevious; selected: KindId[]; onSelection: (selected: KindId[], previous: BudgetPrevious) => void; impact: HistoryIncomeImpact[]; period: string; onPeriodChange: (period: string) => void;
}) {
  const source = impact.filter(item => item.previousKind === previous[item.kind] && selected.includes(item.kind) && (period === "year" ? item.period === "year" : item.period !== "year")).sort((left, right) => left.kind - right.kind);
  const name = (kind: KindId) => comparisonName({ budgetPrevious: previous }, kind).replace("\n", " · ");
  const columns: TableColumn<HistoryIncomeImpact>[] = [
    { id: "budget", label: "予算", type: "choice", value: row => name(row.kind) },
    { id: "period", label: "期間", type: "choice", value: row => row.period === "year" ? "年間" : `${row.period}月` },
    { id: "metric", label: "項目", type: "choice", value: row => amountItems.find(item => item.id === row.metric)!.name },
    ...(["before", "after", "difference"] as const).map((id, index) => ({ id, label: ["履歴の値", "現在の値", "増減"][index]!, type: "number" as const, scale: 1000, value: (row: HistoryIncomeImpact) => row[id].yen })),
  ];
  const tableView = useTableView(source, columns);
  const rows = tableView.rows;
  return <>
    <div className="history-difference-controls">
      <ComparisonSelection selected={selected} previous={previous} onChange={onSelection} />
      <label>表示期間<select value={period} onChange={event => onPeriodChange(event.target.value)}><option value="year">年間</option><option value="months">月別</option></select></label>
    </div>
    <div className="history-difference-scroll history-income-scroll"><table aria-label="履歴と現在の収支への影響"><thead><tr>{columns.map(column => <TableViewHeader key={column.id} view={tableView} column={column.id} />)}</tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.kind}:${row.period}:${row.metric}`}><th scope="row">{name(row.kind)}</th><td>{row.period === "year" ? "年間" : `${row.period}月`}</td><td>{amountItems.find(item => item.id === row.metric)!.name}</td>
        <td>{text(row.before)}</td><td>{text(row.after)}</td><td>{text(row.difference, true)}</td></tr>)}</tbody>{!rows.length && <TableViewEmpty columns={6} />}</table></div>
    {rows.some(row => row.before.error || row.after.error || row.difference.error) && <p role="status">「範囲超過」は正確に表示できる金額の上限を超えています。ほかの値と変更項目は引き続き確認できます。</p>}
  </>;
}
