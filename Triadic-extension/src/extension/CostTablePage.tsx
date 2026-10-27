import { tableCopyCell, useTableRangeCopy } from "./useTableRangeCopy";
import { useAdaptiveTableHeader } from "./useAdaptiveTableHeader";
import { PeriodScrollFrame } from "./PeriodScrollbar";
import { MeasuredTableBody, type TableRowMeasurements } from "./MeasuredTableBody";
import { TableCalculationBoundary } from "./TableCalculationBoundary";
import { periodCellClass } from "./periodCellStyle";
import type { ReactNode, RefObject } from "react";
import { CostBreakdownDialog } from "./CostBreakdownDialog";
import { indexCostBreakdown, type CostBreakdownTarget } from "../core/tables/costBreakdown";
import type { Initiative } from "../core/domain/plan";
import "./CostBreakdown.css";
import { Fragment, memo, useMemo, useState, useLayoutEffect, useRef } from "react";
import { tablePeriods } from "../core/tables/periodTables";
import { buildDisplayedCostComparison } from "../core/tables/comparisonDisplay";
import { filterPlan } from "../core/tables/planTables";
import "./CostClassification.css";
import "./KindSelectionSlots.css";
import type { KindId } from "../core/domain/kinds";
import { type PlanContents } from "../core/domain/plan";

import { formatTableYen, formatTableRate } from "./tableNumberFormat";

export type CostTableView = { industries: number[]; departments: number[]; top: number; left: number; rowHeights?: TableRowMeasurements };

type Props = { contents: PlanContents; selected: KindId[]; selection: ReactNode;
  view: RefObject<CostTableView>; onOpenInitiative: (initiative: Initiative, kind?: KindId) => void; navigationBlocked: boolean };

function industryIdsForDepartments(contents: PlanContents, departmentIds: number[]) {
  return departmentIds.length
    ? contents.departments.filter(item => departmentIds.includes(item.id)).flatMap(item => item.industryIds)
    : contents.industries.map(item => item.id);
}

export function CostTablePage({ contents, selected, selection, view, onOpenInitiative, navigationBlocked }: Props) {
  const [industryIds, setIndustries] = useState<number[]>(view.current.industries);
  const [departmentIds, setDepartments] = useState<number[]>(view.current.departments);
  useLayoutEffect(() => { view.current.industries = industryIds; view.current.departments = departmentIds; }, [industryIds, departmentIds, view]);
  const available = contents;
  const departments = departmentIds.filter(id => available.departments.some(item => item.id === id));
  const allowedIndustries = industryIdsForDepartments(available, departments);
  const industries = industryIds.filter(id => allowedIndustries.includes(id) && available.industries.some(item => item.id === id));
  useLayoutEffect(() => {
    if (industries.length !== industryIds.length) setIndustries(industries);
    if (departments.length !== departmentIds.length) setDepartments(departments);
  }, [available, industryIds, departmentIds]);
  const filtered = useMemo(() => {
    const industries = industryIds.filter(id => allowedIndustries.includes(id) && contents.industries.some(item => item.id === id));
    const departments = departmentIds.filter(id => contents.departments.some(item => item.id === id));
    return filterPlan(contents, {
      industries: industries.length ? industries : null,
      departments: departments.length ? departments : null,
    });
  }, [contents.accounts, contents.aggregations, contents.initiatives, contents.previousAmounts, contents.fiscalYear,
    contents.kinds, contents.previousKind, contents.budgetPrevious, contents.industries, contents.departments, industryIds, departmentIds]);
  return <main className="initiative-list-page cost-table-page" aria-labelledby="cost-table-title">
    <div className="initiative-list-heading">
      <h1 id="cost-table-title">総原価表</h1>
      {selection}
    <div className="cost-classification-row">
      <div className="classification-field">
        <label htmlFor="cost-department">部署名</label>
        <select id="cost-department" value={departments[0] ?? ""} onChange={event => {
          const value = event.target.value === "" ? [] : [Number(event.target.value)];
          setDepartments(value);
          const ids = industryIdsForDepartments(available, value);
          setIndustries(current => value.length === 1 && ids.length === 1 ? ids : current.filter(id => ids.includes(id)));
        }}>
          <option value="">全部署の合計</option>
          {available.departments.map(item => <option key={item.id} value={item.id}>{item.departmentName}</option>)}
        </select>
      </div>
      <div className="classification-field">
        <label htmlFor="cost-industry">業種名</label>
        <select id="cost-industry" value={industries[0] ?? ""} onChange={event => setIndustries(event.target.value === "" ? [] : [Number(event.target.value)])}>
          <option value="">全業種の合計</option>
          {available.industries.filter(item => allowedIndustries.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.industryName}</option>)}
        </select>
      </div>
    </div>
    </div>
    <TableCalculationBoundary resetKeys={[contents, selected, industryIds, departmentIds]}>
      <CostTableContents contents={filtered} selected={selected} view={view} onOpenInitiative={onOpenInitiative} navigationBlocked={navigationBlocked} />
    </TableCalculationBoundary>
  </main>;
}

const CostTableContents = memo(function CostTableContents({ contents, selected, view, onOpenInitiative, navigationBlocked }: Omit<Props, "selection">) {
  const breakdownCandidates = useMemo(() => indexCostBreakdown(contents), [contents.previousAmounts, contents.initiatives]);
  const [detail, setDetail] = useState<{ target: CostBreakdownTarget; title: string; selected: KindId[] } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const tableElement = useRef<HTMLTableElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);
  const measuredHeight = useRef(-1);
  const focused = useRef<{ key: string; label: string } | null>(null);
  const restoreFocus = useRef(false);
  const leavingForInitiative = useRef(false);
  const rowHeights = useMemo(() => view.current.rowHeights ??= { width: 0, rows: {} }, [view]);
  const freezeHeader = useAdaptiveTableHeader(tableElement);
  useLayoutEffect(() => {
    if (container.current) { container.current.scrollTop = view.current.top; container.current.scrollLeft = view.current.left; }
  }, [view]);
  const comparisons = useMemo(() => new Map<string, ReturnType<typeof buildDisplayedCostComparison>>(), [contents]);
  const key = `${contents.previousKind ?? 1}:${[...selected].sort().join(",")}`;
  let table = comparisons.get(key);
  if (!table) {
    table = buildDisplayedCostComparison(contents, selected);
    comparisons.set(key, table);
  }
  const { labels, rows, columns } = table;
  const copyRowIndices = useMemo(() => new Map(rows.map((row, index) => [row, index])), [rows]);
  const rangeCopy = useTableRangeCopy(container, { rowCount: rows.length, columnCount: tablePeriods.length * labels.length, resetKey: rows,
    textAt: (rowIndex, column) => {
      const row = rows[rowIndex]!, period = tablePeriods[Math.floor(column / labels.length)]!, index = column % labels.length;
      return row.kind === "ratio" ? formatTableRate(row.values[index]![period.id], Boolean(columns[index]!.difference))
        : formatTableYen(row.values[index]![period.id]);
    } });
  const salesGroupId = contents.aggregations.find(group => group.required === "sales")?.id;
  const salesIndex = rows.findIndex(row => row.kind === "group" && row.id === salesGroupId);
  // A prefix that cannot possibly fit already uses the column-only fallback.
  // Put its data rows into the same row window, rather than mounting them all.
  const virtualPrefix = rows.length > 200 && (salesIndex + 1) * 24 + 72 > availableHeight;
  const bodyRows = useMemo(() => virtualPrefix ? rows : rows.slice(salesIndex + 1), [rows, salesIndex, virtualPrefix]);
  useLayoutEffect(() => {
    const region = container.current;
    if (!region) return;
    const measure = () => {
      if (measuredHeight.current === region.clientHeight) return;
      restoreFocus.current = Boolean(tableElement.current?.contains(document.activeElement));
      measuredHeight.current = region.clientHeight; setAvailableHeight(region.clientHeight);
    };
    const observer = new ResizeObserver(measure); observer.observe(region); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (restoreFocus.current && focused.current && (document.activeElement === document.body || document.activeElement === container.current)) {
      [...(tableElement.current?.querySelectorAll<HTMLButtonElement>("button[aria-label]") ?? [])]
        .find(button => button.getAttribute("aria-label") === focused.current!.label)?.focus();
    }
    restoreFocus.current = false;
  }, [availableHeight, virtualPrefix, detail]);
  const renderRow = (row: (typeof rows)[number]) => <tr key={`${row.kind}:${row.id}`} data-cost-row={`${row.kind}:${row.id}`} className={`cost-data-row${row.kind !== "account" ? ` cost-subtotal${row.required ? " cost-required" : ""}` : ""}${row.kind === "group" && row.id === salesGroupId ? " cost-sales-anchor" : ""}`}>
    <th scope="row" className="initiative-list-name">{row.name}{!row.configured && <span className="cost-unconfigured">未設定</span>}</th>
    {tablePeriods.map(period => <Fragment key={period.id}>{row.values.map((values, index) => <td key={index} {...tableCopyCell(copyRowIndices.get(row)!, tablePeriods.indexOf(period) * labels.length + index)} className={periodCellClass(period, index === 0, index === labels.length - 1)}>{row.kind === "ratio" ? formatTableRate(values[period.id], Boolean(columns[index]!.difference))
      : row.configured && values[period.id] !== undefined ? <button type="button" className="cost-amount-button"
        aria-label={`${row.name} ${period.label} ${labels[index]}の内訳`} aria-description={formatTableYen(values[period.id]) || "0"} disabled={navigationBlocked}
        onFocus={event => {
          if (leavingForInitiative.current) return;
          const region = container.current;
          if (!region) return;
          const left = region.querySelector("th")!.getBoundingClientRect().right;
          const right = region.getBoundingClientRect().right - 14;
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.left < left) region.scrollLeft -= left - rect.left + 6;
          else if (rect.right > right) region.scrollLeft += rect.right - right + 6;
        }}
        onClick={event => {
          focused.current = { key: `${row.kind}:${row.id}`, label: event.currentTarget.getAttribute("aria-label")! };
          setDetail({ target: { kind: row.kind as "account" | "group", id: row.id, period, column: columns[index]!.source, displayPrevious: contents.budgetPrevious?.display ?? 1 }, selected: columns[index]!.selected, title: `${row.name} ${period.label} ${labels[index]}` });
        }}>{formatTableYen(values[period.id])}</button>
      : formatTableYen(values[period.id])}</td>)}</Fragment>)}
  </tr>;
  return <><PeriodScrollFrame container={container} label="総原価表" layoutKey={key}><div ref={container} {...rangeCopy} onScroll={event => { view.current.top = event.currentTarget.scrollTop; view.current.left = event.currentTarget.scrollLeft; }} className="initiative-list-container cost-table-container" role="region" aria-label="総原価表の月別前年・種別別金額" tabIndex={0}>
      <table ref={tableElement} onFocusCapture={event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[aria-label]"), key = button?.closest<HTMLElement>("tr[data-cost-row]")?.dataset.costRow;
        if (button && key) focused.current = { key, label: button.getAttribute("aria-label")! };
      }} className={`initiative-list-table cost-table${freezeHeader ? "" : " cost-header-scroll"}`} aria-label="総原価表">
        <colgroup>
          <col className="cost-name-column" />
          {tablePeriods.flatMap(period => labels.map((_, index) => <col key={`${period.id}:${index}`} className="cost-amount-column" />))}
        </colgroup>
        <thead>
          <tr data-column-header><th rowSpan={2} scope="col" className="initiative-list-name">科目・集計</th>
            {tablePeriods.map(period => <th key={period.id} data-table-period={period.id} colSpan={labels.length} scope="colgroup" className={periodCellClass(period, true)}>{period.label}</th>)}
          </tr>
          <tr data-column-header>{tablePeriods.map(period => <Fragment key={period.id}>{labels.map((_, index) => <th key={index} scope="col" className={periodCellClass(period, index === 0, index === labels.length - 1)}>{labels[index]}</th>)}</Fragment>)}</tr>
          {!virtualPrefix && rows.slice(0, salesIndex + 1).map(renderRow)}
        </thead>
        <MeasuredTableBody rows={bodyRows} container={container} estimate={24} columns={1 + tablePeriods.length * labels.length}
          retainKey={focused.current?.key ?? null} heightCache={rowHeights} rowKey={row => `${row.kind}:${row.id}`} render={renderRow} />
      </table>
    </div></PeriodScrollFrame>
    {detail && <CostBreakdownDialog contents={contents} selected={detail.selected} target={detail.target} title={detail.title}
      candidates={breakdownCandidates} navigationBlocked={navigationBlocked} onClose={() => { restoreFocus.current = true; setDetail(null); }} onOpenInitiative={(initiative, kind) => {
        leavingForInitiative.current = true; restoreFocus.current = false; onOpenInitiative(initiative, kind);
      }} />}
    </>;
});
