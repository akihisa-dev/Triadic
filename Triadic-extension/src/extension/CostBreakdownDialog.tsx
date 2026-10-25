import { useTableCellFilter } from "./TableCellFilter";
import { TableViewHeader, TableViewEmpty, useTableView } from "./TableViewHeader";
import type { TableColumn } from "../core/tables/columnView";
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { buildCostBreakdown, indexCostBreakdown, type CostBreakdownTarget } from "../core/tables/costBreakdown";
import { MeasuredTableBody } from "./MeasuredTableBody";
import type { Initiative, PlanContents } from "../core/domain/plan";
import type { KindId } from "../core/domain/kinds";
import { formatYen, sumYen } from "../core/domain/amounts";
import "./CostBreakdown.css";

type Props = { contents: PlanContents; selected: KindId[]; target: CostBreakdownTarget; title: string;
  navigationBlocked: boolean; onClose: () => void; onOpenInitiative: (initiative: Initiative, kind?: KindId) => void; candidates?: ReturnType<typeof indexCostBreakdown> };

const columns = [["name", "前年・施策"], ["account", "科目"], ["department", "部署"], ["industry", "業種"], ["sign", "集計の加減"], ["amount", "反映額"]] as const;

export function CostBreakdownDialog({ contents, selected, target, title, navigationBlocked, onClose, onOpenInitiative, candidates }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const container = useRef<HTMLDivElement>(null);
  const prepared = useMemo(() => candidates ?? indexCostBreakdown(contents), [candidates, contents.previousAmounts, contents.initiatives]);
  const result = useMemo(() => {
    try { return { detail: buildCostBreakdown(contents, target, selected, prepared), error: "" }; }
    catch (error) { return { detail: null, error: error instanceof Error ? error.message : "内訳を計算できませんでした。" }; }
  }, [contents, target, selected, prepared]);
  const accounts = new Map(contents.accounts.map(item => [item.id, item.displayName ?? item.accountName]));
  const departments = new Map(contents.departments.map(item => [item.id, item.departmentName]));
  const industries = new Map(contents.industries.map(item => [item.id, item.industryName]));
  const initiatives = new Map(contents.initiatives.map(item => [item.id, item]));
  type Line = NonNullable<typeof result.detail>["lines"][number];
  const definitions: TableColumn<Line>[] = [
    { id: "name", label: "前年・施策", value: row => row.name },
    { id: "account", label: "科目", type: "choice", value: row => accounts.get(row.accountId) },
    { id: "department", label: "部署", type: "choice", value: row => departments.get(row.departmentId!) },
    { id: "industry", label: "業種", type: "choice", value: row => industries.get(row.industryId!) },
    { id: "sign", label: "集計の加減", type: "choice", value: row => row.sign === -1 ? "−" : "＋", sortValue: row => row.sign },
    { id: "amount", label: "反映額", type: "number", scale: 1000, value: row => row.amount },
  ];
  const tableView = useTableView(result.detail?.lines ?? [], definitions);
  useLayoutEffect(() => { if (container.current) container.current.scrollTop = 0; }, [tableView.state]);
  const cellFilter = useTableCellFilter(tableView, navigationBlocked);
  const displayed = tableView.rows;
  let total = "";
  try { total = formatYen(sumYen(displayed.map(row => row.amount))); } catch { total = "金額が計算範囲を超えています。"; }
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog cost-breakdown-dialog" aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
    <div className="cost-breakdown-heading"><h2 id={heading}>{title}の内訳</h2>
      <button autoFocus type="button" className="secondary-button" onClick={onClose}>閉じる</button></div>
    {result.error ? <p role="alert">{result.error}</p> : <>
      <div ref={container} className="cost-breakdown-scroll"><table aria-label="金額の内訳">
        <thead><tr>{columns.map(([column]) => <TableViewHeader key={column} view={tableView} column={column} />)}</tr></thead>
        <MeasuredTableBody key={JSON.stringify(tableView.state)} rows={displayed} container={container} columns={6} rowKey={line => line.key} render={line => <tr>
          <th {...cellFilter.props("name", line.name)} scope="row">{line.initiativeId === null ? line.name : <button type="button" className="initiative-name-button" disabled={navigationBlocked}
            onClick={() => { const initiative = initiatives.get(line.initiativeId!); if (initiative) { onClose(); onOpenInitiative(initiative, [...selected].sort((a, b) => a - b)[target.column > 0 && target.column <= selected.length ? target.column - 1 : selected.length - 1]); } }}>{line.name}</button>}</th>
          <td {...cellFilter.props("account", accounts.get(line.accountId))}>{accounts.get(line.accountId)}</td><td {...cellFilter.props("department", departments.get(line.departmentId!))}>{departments.get(line.departmentId!) ?? ""}</td><td {...cellFilter.props("industry", industries.get(line.industryId!))}>{industries.get(line.industryId!) ?? ""}</td>
          <td {...cellFilter.props("sign", line.sign === -1 ? "−" : "＋")}>{line.sign === -1 ? "−" : "＋"}</td><td>{formatYen(line.amount)}</td>
        </tr>} />
        <tfoot><tr><th scope="row" colSpan={5}>{tableView.filtered ? "表示中の合計" : "合計"}</th><td>{total}</td></tr></tfoot>
        {tableView.filtered && !displayed.length && <TableViewEmpty columns={6} />}
      </table></div>
      {result.detail!.lines.length === 0 && <p>対象となる金額はありません。</p>}
    </>}
  {cellFilter.menu}
  </dialog>, document.body);
}
