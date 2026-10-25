import { tableCopyCell, useTableRangeCopy } from "./useTableRangeCopy";
import { InitiativeNameButton } from "./InitiativeNameButton";
import { hasUnclassifiedAmount } from "../core/domain/budgetHints";
import { useRowWindow, WindowRows } from "./VirtualTableRows";
import { TableCalculationBoundary } from "./TableCalculationBoundary";
import { createInitiativeListView, type InitiativeListView } from "../core/tables/initiativeListView";
import type { Account } from "../core/domain/accountMaster";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { amountItems } from "../core/domain/amountItems";
import { initiativeMonths } from "../core/domain/calendar";
import { type Initiative } from "../core/domain/plan";
import type { Expansion } from "../core/domain/expansionMaster";
import type { PeriodType } from "../core/domain/periodMaster";
import type { KindId } from "../core/domain/kinds";

import { type TableColumn, type TableSort, type TableViewState } from "../core/tables/columnView";
import { useTableCellFilter } from "./TableCellFilter";
import { TableViewHeader, TableViewEmpty, useTableView } from "./TableViewHeader";
import { initiativeTotals } from "../core/tables/initiativeTotals";
import type { InitiativeListRow } from "../core/tables/initiativeListView";

import { formatYen } from "../core/domain/amounts";
import { useWindowViewState } from "./windowView";
const amountText = (amount: number | null | undefined) => amount === undefined ? "" : amount === null ? "属性未設定" : formatYen(amount);

export type InitiativeListReturn = { id: number; identity: string; sort: TableSort | null; filters?: TableViewState["filters"] };

type InitiativeListPageProps = {
  returnTo?: RefObject<InitiativeListReturn | null>;
  selection: ReactNode;
  selectedKind: KindId;
  initiatives: Initiative[];
  accounts: Account[];
  expansions: Expansion[];
  periodTypes: PeriodType[];
  fiscalYear: string;
  onAddInitiative: () => void;
  onOpenInitiative: (initiative: Initiative, kind: KindId) => void;
  navigationBlocked: boolean;
};

export function InitiativeListPage({ returnTo, selection, selectedKind, initiatives, accounts, expansions, periodTypes, fiscalYear, onAddInitiative, onOpenInitiative, navigationBlocked }: InitiativeListPageProps) {
  const readOnly = useHistoryReadOnly();
  const [returnTarget] = useState(() => returnTo?.current ?? null);
  const [sort, setSort] = useWindowViewState("initiative-list:sort", returnTarget?.sort ?? null, true);
  const [filters, setFilters] = useWindowViewState("initiative-list:filters", returnTarget?.filters ?? {}, true);
  const [focusedId, setFocusedId] = useState<number | null>(() => initiatives.find(item => item.id === returnTarget?.id && item.identity === returnTarget.identity)?.id ?? null);
  const container = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!returnTarget) return;
    if (returnTo) returnTo.current = null;
    const button = container.current?.querySelector<HTMLButtonElement>(`button[data-initiative-identity="${returnTarget.identity}"]`);
    const target = button ?? (addButton.current?.disabled ? container.current : addButton.current);
    target?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (button && container.current) {
      const top = container.current.getBoundingClientRect().top + (container.current.querySelector("thead")?.getBoundingClientRect().height ?? 0);
      const offset = button.getBoundingClientRect().top - top;
      if (offset < 0) container.current.scrollTop += offset;
    }
  }, [returnTarget, returnTo]);
  const expansionNames = useMemo(() => new Map(expansions.map(item => [item.id, item.expansionName])), [expansions]);
  const accountsById = useMemo(() => new Map(accounts.map(item => [item.id, item])), [accounts]);
  const unclassifiedIds = useMemo(() => new Set(initiatives.filter(item => item.rows.some(row => hasUnclassifiedAmount(row, selectedKind, accountsById.get(row.accountId!)))).map(item => item.id)), [initiatives, selectedKind, accountsById]);
  const periodNames = useMemo(() => new Map(periodTypes.map(item => [item.id, item.periodName])), [periodTypes]);
  const viewForKind = useMemo(() => createInitiativeListView(initiatives, accounts, fiscalYear), [initiatives, accounts, fiscalYear]);
  const view = viewForKind(selectedKind);
  const { source } = view;
  const columns = useMemo<TableColumn<InitiativeListRow>[]>(() => [
    { id: "expansion", label: "展開名", type: "choice", value: row => expansionNames.get(row.expansionId!) ?? "" },
    { id: "period", label: "期間名", type: "choice", value: row => periodNames.get(row.periodTypeId!) ?? "" },
    { id: "name", label: "施策名", value: row => row.name },
    { id: "start", label: "開始年月", type: "choice", value: row => row.startYearMonths[selectedKind] ?? "" },
    ...initiativeMonths.flatMap(month => amountItems.map(metric => ({ id: `${month}:${metric.id}`, label: metric.name, name: `${month}月 ${metric.name}`, type: "number" as const, scale: 1000,
      value: (row: InitiativeListRow) => row.calculation === "ready" ? row.months[month]?.[metric.id] : null }))),
  ], [expansionNames, periodNames, selectedKind]);
  const tableState = useMemo(() => ({ sort, filters }), [sort, filters]);
  const tableView = useTableView(source, columns, { state: tableState, change: state => {
    setSort(state.sort); setFilters(state.filters); if (container.current) container.current.scrollTop = 0;
  } });
  const cellFilter = useTableCellFilter(tableView, navigationBlocked);
  const displayed = tableView.rows;
  const displayedView = useMemo(() => {
    if (!tableView.filtered) return view;
    const errors = new Map(displayed.flatMap(row => row.calculation === "failed" ? [[row.id, row.error] as const] : []));
    try { return { source: displayed, errors, totals: errors.size ? null : initiativeTotals(displayed.filter(row => row.calculation === "ready")), totalError: null }; }
    catch (failure) { return { source: displayed, errors, totals: null, totalError: (failure as Error).message }; }
  }, [view, displayed, tableView.filtered]);
  const { errors } = displayedView;
  const rangeCopy = useTableRangeCopy(container, { rowCount: displayed.length + 1, columnCount: 36, resetKey: displayedView,
    textAt: (row, column) => {
      const month = initiativeMonths[Math.floor(column / amountItems.length)]!, metric = amountItems[column % amountItems.length]!;
      if (row === displayed.length) return displayedView.totals ? amountText(displayedView.totals[month]?.[metric.id]) : "計算不可";
      const item = displayed[row]!;
      return item.calculation === "failed" ? "計算不可" : amountText(item.months[month]?.[metric.id]);
    } });
  const window = useRowWindow(container, displayed.length, 28, 200, 56);
  const virtual = displayed.length > 200;
  const focusedIndex = useMemo(() => focusedId === null ? -1 : displayed.findIndex(item => item.id === focusedId), [displayed, focusedId]);
  const rendered = useMemo(() => {
    const indices = new Set(Array.from({ length: window.end - window.start }, (_, offset) => window.start + offset));
    // Keep the focused control and its Tab neighbours alive outside the viewport.
    if (focusedIndex >= 0) for (const index of [focusedIndex - 1, focusedIndex, focusedIndex + 1]) {
      if (index >= 0 && index < displayed.length) indices.add(index);
    }
    return [...indices].sort((a, b) => a - b).map(index => ({ item: displayed[index]!, index, key: displayed[index]!.id }));
  }, [displayed, window.start, window.end, focusedIndex]);
  const sortHeader = (column: string, _label: string, className: string) => <TableViewHeader view={tableView} column={column} rowSpan={2} className={`initiative-list-fixed ${className}`} />;
  return <main className="initiative-list-page initiative-overview-page" aria-labelledby="initiative-list-title">
    <div className="initiative-list-heading">
      <h1 id="initiative-list-title">施策一覧</h1>
      {selection}
      {tableView.filtered && <span className="master-count" role="status">{displayed.length} / {source.length}件</span>}
      <button ref={addButton} className="primary-button" type="button" disabled={navigationBlocked || readOnly} onClick={onAddInitiative}>施策を追加</button>
    </div>
    <TableCalculationBoundary resetKeys={[initiatives, accounts, selectedKind, fiscalYear]}>
    <div ref={container} {...rangeCopy} className="initiative-list-container" role="region" aria-label="施策一覧の月別売上・費用・利益" tabIndex={0}>
      <table className={`initiative-list-table${virtual ? " virtual-table" : ""}`} style={{ "--virtual-row-height": "28px" } as React.CSSProperties} aria-label="施策一覧" aria-rowcount={displayed.length + 3}>
        <colgroup>
          <col className="initiative-expansion-column" />
          <col className="initiative-period-column" />
          <col className="initiative-name-column" />
          <col className="initiative-start-column" />
          <col span={36} />
        </colgroup>
        <thead>
          <tr>
            {sortHeader("expansion", "展開名", "initiative-list-expansion")}
            {sortHeader("period", "期間名", "initiative-list-period")}
            {sortHeader("name", "施策名", "initiative-list-name")}
            {sortHeader("start", "開始年月", "initiative-list-start")}
            {initiativeMonths.map(month => <th key={month} colSpan={3} scope="colgroup">{month}月</th>)}
          </tr>
          <tr>{initiativeMonths.map(month => <Fragment key={month}>
            {amountItems.map((metric, index) => <TableViewHeader key={metric.id} view={tableView} column={`${month}:${metric.id}`} className={index === amountItems.length - 1 ? "initiative-month-end" : undefined} />)}
          </Fragment>)}</tr>
        </thead>
        <tbody><WindowRows items={rendered} count={displayed.length} height={28} columns={40} render={(item, indexRow) => <tr key={item.id} aria-rowindex={indexRow + 3}>
          <td {...cellFilter.props("expansion", expansionNames.get(item.expansionId!))} className="initiative-list-fixed initiative-list-expansion">{item.expansionId == null ? "" : expansionNames.get(item.expansionId) ?? ""}</td>
          <td {...cellFilter.props("period", periodNames.get(item.periodTypeId!))} className="initiative-list-fixed initiative-list-period">{item.periodTypeId == null ? "" : periodNames.get(item.periodTypeId) ?? ""}</td>
          <th {...cellFilter.props("name", item.name)} scope="row" className="initiative-list-fixed initiative-list-name">
            <InitiativeNameButton name={item.name} note={item.note} data-initiative-identity={item.identity} className="initiative-name-button" type="button" disabled={navigationBlocked} onFocus={() => setFocusedId(item.id)}
              onBlur={event => {
                // Native Tab blurs before focusing its destination. Do not unmount that neighbour between the events.
                if (!(event.relatedTarget instanceof Node && event.currentTarget.closest("tbody")?.contains(event.relatedTarget))) setFocusedId(null);
              }} onClick={() => {
                if (returnTo) returnTo.current = { id: item.id, identity: item.identity ?? "", sort, filters };
                onOpenInitiative(item, selectedKind);
              }}>{item.name}{unclassifiedIds.has(item.id) && <span className="initiative-attribute-hint"> · 属性未設定</span>}</InitiativeNameButton>
          </th>
          <td {...cellFilter.props("start", item.startYearMonths[selectedKind])} className="initiative-list-fixed initiative-list-start">{item.startYearMonths[selectedKind]}</td>
          {item.calculation === "failed" ? <td colSpan={36} role="alert" style={{ textAlign: "left" }}>{item.error} 施策を開いて金額を修正してください。</td> : initiativeMonths.map(month => <Fragment key={month}>
            {amountItems.map((metric, index) => <td key={metric.id} {...tableCopyCell(indexRow, initiativeMonths.indexOf(month) * amountItems.length + index)} className={index === amountItems.length - 1 ? "initiative-month-end" : undefined}>{amountText(item.months[month]?.[metric.id])}</td>)}
          </Fragment>)}
        </tr>} />{!virtual && <tr className="initiative-list-fill" aria-hidden="true"><td colSpan={40} /></tr>}</tbody>
        {tableView.filtered && displayed.length === 0 && <TableViewEmpty columns={40} />}
        <tfoot>{errors.size ? <tr className="initiative-total-row"><th colSpan={40} scope="row" style={{ textAlign: "left" }}>計算できない施策があるため、合計を表示できません。</th></tr> : <InitiativeTotalRow view={displayedView} filtered={tableView.filtered} copyRow={displayed.length} />}</tfoot>
      </table>
    </div>
    </TableCalculationBoundary>
    {cellFilter.menu}
    {source.length === 0 && <p className="page-description">表示する施策がありません。</p>}
  </main>;
}

function InitiativeTotalRow({ view, filtered, copyRow }: { view: InitiativeListView; filtered: boolean; copyRow: number }) {
  if (!view.totals) return <tr className="initiative-total-row"><th colSpan={40} scope="row" role="alert">{view.totalError} 施策を開いて金額を修正してください。</th></tr>;
  const totals = view.totals;
  return <tr className="initiative-total-row">
    <th colSpan={4} scope="row" className="initiative-total-label"><span>{filtered ? "表示中の合計" : "合計"}</span></th>
    {initiativeMonths.map(month => <Fragment key={month}>
      {amountItems.map((metric, index) => <td key={metric.id} {...tableCopyCell(copyRow, initiativeMonths.indexOf(month) * amountItems.length + index)} className={index === amountItems.length - 1 ? "initiative-month-end" : undefined}>{amountText(totals[month]?.[metric.id])}</td>)}
    </Fragment>)}
  </tr>;
}
