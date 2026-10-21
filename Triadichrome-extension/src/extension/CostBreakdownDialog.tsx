import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { buildCostBreakdown, indexCostBreakdown, type CostBreakdownTarget } from "../core/tables/costBreakdown";
import { MeasuredTableBody } from "./MeasuredTableBody";
import type { Initiative, PlanContents } from "../core/domain/plan";
import type { KindId } from "../core/domain/kinds";
import { formatYen } from "../core/domain/amounts";
import "./CostBreakdown.css";

type Props = { contents: PlanContents; selected: KindId[]; target: CostBreakdownTarget; title: string;
  navigationBlocked: boolean; onClose: () => void; onOpenInitiative: (initiative: Initiative, kind?: KindId) => void; candidates?: ReturnType<typeof indexCostBreakdown> };

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
        <thead><tr><th scope="col">前年・施策</th><th scope="col">科目</th><th scope="col">部署</th><th scope="col">業種</th><th scope="col">集計の加減</th><th scope="col">反映額</th></tr></thead>
        <MeasuredTableBody rows={result.detail!.lines} container={container} columns={6} rowKey={line => line.key} render={line => <tr>
          <th scope="row">{line.initiativeId === null ? line.name : <button type="button" className="initiative-name-button" disabled={navigationBlocked}
            onClick={() => { const initiative = initiatives.get(line.initiativeId!); if (initiative) { onClose(); onOpenInitiative(initiative, [...selected].sort((a, b) => a - b)[target.column > 0 && target.column <= selected.length ? target.column - 1 : selected.length - 1]); } }}>{line.name}</button>}</th>
          <td>{accounts.get(line.accountId)}</td><td>{departments.get(line.departmentId!) ?? ""}</td><td>{industries.get(line.industryId!) ?? ""}</td>
          <td>{line.sign === -1 ? "−" : "＋"}</td><td>{formatYen(line.amount)}</td>
        </tr>} />
        <tfoot><tr><th scope="row" colSpan={5}>合計</th><td>{formatYen(result.detail!.total)}</td></tr></tfoot>
      </table></div>
      {result.detail!.lines.length === 0 && <p>対象となる金額はありません。</p>}
    </>}
  </dialog>, document.body);
}
