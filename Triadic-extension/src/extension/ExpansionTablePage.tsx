import { tableCopyCell, useTableRangeCopy } from "./useTableRangeCopy";
import { useTableCellFilter } from "./TableCellFilter";
import { TableViewHeader, TableViewEmpty, useTableView } from "./TableViewHeader";
import { emptyTableView, type TableColumn } from "../core/tables/columnView";
import { useWindowViewState } from "./windowView";
import type { ExpansionMonths } from "../core/tables/expansionTable";
import { ExpansionScrollbar, expansionScrollRegionId } from "./ExpansionScrollbar";
import { PeriodScrollFrame } from "./PeriodScrollbar";
import { useRowWindow, WindowRows } from "./VirtualTableRows";
import { TableCalculationBoundary } from "./TableCalculationBoundary";
import { periodCellClass } from "./periodCellStyle";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Fragment, memo, useMemo, useRef, useState } from "react";
import { expansionPeriodAmount, tablePeriods } from "../core/tables/periodTables";
import { type Initiative, type PlanContents } from "../core/domain/plan";
import { createExpansionTableView, selectExpansionView, type ExpansionViewItem } from "../core/tables/expansionTableView";
import type { KindId } from "../core/domain/kinds";
import { displayedExpansionPrevious } from "../core/tables/comparisonDisplay";
import { formatTableYen } from "./tableNumberFormat";

type Props = {
  contents: PlanContents; selected: KindId[]; selection: ReactNode;
  onOpenInitiative: (initiative: Initiative, kind: KindId) => void;
};
const AmountCells = memo(function AmountCells({ values, copyRow, error = "" }: { values: ExpansionMonths[]; copyRow: number; error?: string }) {
  return tablePeriods.map(period => <Fragment key={period.id}>{values.map((months, index) => <Fragment key={index}>
    {(["sales", "profit"] as const).map(metric => {
      let text: string, reason = "";
      try {
        const amount = expansionPeriodAmount(months, period, metric);
        text = amount === null ? error ? "計算不可" : "属性未設定" : formatTableYen(amount);
        if (amount === null && error) reason = error;
      } catch (failure) { text = "範囲超過"; reason = (failure as Error).message; }
      return <td key={metric} {...tableCopyCell(copyRow, tablePeriods.indexOf(period) * values.length * 2 + index * 2 + (metric === "profit" ? 1 : 0))} title={reason || text} className={periodCellClass(period, metric === "sales" && index === 0, metric === "profit" && index === values.length - 1)}>{text}</td>;
    })}
  </Fragment>)}</Fragment>);
});
type ExpansionItem = NonNullable<ReturnType<ReturnType<typeof createExpansionTableView>>["flat"][number]["item"]>;
function ExpansionGroupCell({ name, span, title, cellProps }: { name: string; span?: number; title?: string; cellProps: HTMLAttributes<HTMLTableCellElement> }) {
  return <th {...cellProps} rowSpan={span} scope="rowgroup" className="expansion-group" title={title}>{name}</th>;
}
function ExpansionSubtotalCells({ name, values, filtered, copyRow, error = "" }: { name: string; values: ExpansionMonths[]; copyRow: number; filtered?: boolean; error?: string }) {
  return <><th colSpan={3} scope="row" className="expansion-subtotal-name">{name}計{filtered ? "（表示中）" : ""}</th><AmountCells values={values} error={error} copyRow={copyRow} /></>;
}
/** Row content and navigation are identical; each renderer owns spans and focus retention. */
function ExpansionInitiativeCells({ item, source, kind, onOpen, period, category, focusHandlers, cellFilter, copyRow }: {
  copyRow: number; item: ExpansionItem; source: Initiative; kind: KindId; onOpen: Props["onOpenInitiative"];
  period: { name: string; span: number } | null; category: { name: string; span: number } | null;
  focusHandlers?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onFocus" | "onBlur">;
  cellFilter: ReturnType<typeof useTableCellFilter<ExpansionViewItem>>;
}) {
  return <>
    {period && <th {...cellFilter.props("period", period.name)} rowSpan={period.span} className="expansion-period">{period.name}</th>}
    {category && <td {...cellFilter.props("category", category.name)} rowSpan={category.span} className="expansion-category" title={category.name}>{category.name}</td>}
    <th {...cellFilter.props("name", item.name)} scope="row" className="expansion-name"><button className="initiative-name-button" type="button" {...focusHandlers}
      title={item.note || item.name} onClick={() => onOpen(source, kind)}>{item.name}</button></th>
    <AmountCells values={item.values} copyRow={copyRow} />
  </>;
}
export function ExpansionTablePage({ contents, selected: requested, selection, onOpenInitiative }: Props) {
  const selected = useMemo(() => [...requested].sort(), [requested]);
  return <main className="initiative-list-page expansion-table-page" aria-labelledby="expansion-table-title">
    <div className="initiative-list-heading">
      <h1 id="expansion-table-title">展開表</h1>
      {selection}
    </div>
    <TableCalculationBoundary resetKeys={[contents, selected]}>
      <ExpansionTableContents contents={contents} selected={selected} onOpenInitiative={onOpenInitiative} />
    </TableCalculationBoundary>
  </main>;
}

function ExpansionTableContents({ contents, selected, onOpenInitiative }: Omit<Props, "selection">) {
  const viewForSelection = useMemo(() => createExpansionTableView(contents),
    [contents.initiatives, contents.accounts, contents.previousAmounts, contents.previousKind, contents.budgetPrevious, contents.expansions, contents.periodTypes, contents.expansionCategories, contents.fiscalYear]);
  const baseView = viewForSelection(selected);
  const previousRow = useMemo(() => displayedExpansionPrevious(contents, selected), [contents, selected]);
  const categoryNames = useMemo(() => new Map(contents.expansionCategories.map(category => [category.id, category.categoryName])), [contents.expansionCategories]);
  const sourceInitiatives = useMemo(() => new Map(contents.initiatives.map(item => [item.id, item])), [contents.initiatives]);
  const categoryName = (item: Pick<Initiative, "expansionCategoryId">) => item.expansionCategoryId == null ? "" : categoryNames.get(item.expansionCategoryId) ?? "";
  const container = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useWindowViewState("expansion:table-view", emptyTableView(), true);
  const columns = useMemo<TableColumn<ExpansionViewItem>[]>(() => {
    const expansionNames = new Map(contents.expansions.map(item => [item.id, item.expansionName]));
    const periodNames = new Map(contents.periodTypes.map(item => [item.id, item.periodName]));
    const labels = [...selected.map(id => id === 1 ? "一次予算" : "確定予算"), ...(selected.length === 2 ? ["確定予算−一次予算"] : [])];
    return [
      { id: "expansion", label: "展開名", type: "choice", value: row => expansionNames.get(row.expansionId!) },
      { id: "period", label: "期間名", type: "choice", value: row => periodNames.get(row.periodTypeId!) },
      { id: "category", label: "展開区分", type: "choice", value: row => categoryNames.get(row.expansionCategoryId!) },
      { id: "name", label: "施策名", value: row => row.name },
      ...tablePeriods.flatMap(period => labels.flatMap((label, index) => (["sales", "profit"] as const).map(metric => ({
        id: `${period.id}:${selected[index] ?? "difference"}:${metric}`, label: metric === "sales" ? "売上" : "利益",
        name: `${period.label} ${label} ${metric === "sales" ? "売上" : "利益"}`, type: "number" as const, scale: 1000,
        value: (row: ExpansionViewItem) => { try { return expansionPeriodAmount(row.values[index]!, period, metric); } catch { return null; } },
      })))),
    ];
  }, [contents.expansions, contents.periodTypes, contents.kinds, contents.budgetPrevious, contents.previousKind, categoryNames, selected]);
  const members = useMemo(() => baseView.table.groups.flatMap(group => group.initiatives), [baseView]);
  const tableView = useTableView(members, columns, { state: viewState, change: state => { setViewState(state); if (container.current) container.current.scrollTop = 0; } });
  const cellFilter = useTableCellFilter(tableView);
  const { table, groups, flat, calculationError } = useMemo(() => selectExpansionView(baseView, contents, columns, viewState), [baseView, contents, columns, viewState]);
  const copyIndices = useMemo(() => new Map(flat.map((row, index) => [row.item ? `initiative:${row.item.id}` : `subtotal:${row.group.expansion.id}`, index + 3])), [flat]);
  const copyColumns = (selected.length === 2 ? 3 : 1) * 2;
  const copyTextAt = (rowIndex: number, column: number) => {
    const row = flat[rowIndex - 3];
    const values = rowIndex === 0 ? previousRow.values : rowIndex === 1 ? table.total : rowIndex === 2 ? table.changes : row!.item ? row!.item.values : row!.group.values;
    const period = tablePeriods[Math.floor(column / copyColumns)]!, index = Math.floor((column % copyColumns) / 2), metric = column % 2 ? "profit" : "sales";
    const months = values[index]!;
    try { const amount = expansionPeriodAmount(months, period, metric); return amount === null ? calculationError ? "計算不可" : "属性未設定" : formatTableYen(amount); }
    catch { return "範囲超過"; }
  };
  const rangeCopy = useTableRangeCopy(container, { rowCount: flat.length + 3, columnCount: tablePeriods.length * copyColumns, resetKey: flat,
    textAt: copyTextAt,
    describeAt: (rowIndex, column) => {
      const row = flat[rowIndex - 3];
      const name = rowIndex < 3 ? [previousRow.label, "合計", "展開計"][rowIndex] : row!.item?.name ?? `${row!.group.expansion.expansionName}計`;
      return `${name} ${tablePeriods[Math.floor(column / copyColumns)]!.label} ${labels[Math.floor((column % copyColumns) / 2)]} ${column % 2 ? "利益" : "売上"} 金額（千円）${copyTextAt(rowIndex, column) || "0（表示は空欄）"}`;
    },
  });
  const window = useRowWindow(container, flat.length, 28, 200, 165);
  const virtual = flat.length > 200;
  const scrollTargets = useMemo(() => flat.flatMap((row, index) => row.groupOffset === 0
    ? [{ id: row.group.expansion.id, name: row.group.expansion.expansionName, index }] : []), [flat]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const focusedIndex = useMemo(() => focusedId === null ? -1 : flat.findIndex(row => row.item?.id === focusedId), [flat, focusedId]);
  const rendered = useMemo(() => {
    const indices = new Set(Array.from({ length: window.end - window.start }, (_, offset) => window.start + offset));
    const focused = focusedIndex;
    if (focused >= 0) {
      indices.add(focused);
      // Subtotals have no focusable control; retain the nearest initiative on either side.
      for (const step of [-1, 1]) {
        let index = focused + step;
        while (index >= 0 && index < flat.length && !flat[index]!.item) index += step;
        if (index >= 0 && index < flat.length) indices.add(index);
      }
    }
    const ranges: { start: number; end: number }[] = [];
    for (const index of [...indices].sort((a, b) => a - b)) {
      const last = ranges.at(-1);
      if (last?.end === index) last.end++;
      else ranges.push({ start: index, end: index + 1 });
    }
    return ranges.flatMap(range => flat.slice(range.start, range.end).map((row, offset) => ({
      item: { row, range }, index: range.start + offset,
      key: row.item ? `initiative:${row.item.id}` : `subtotal:${row.group.expansion.id}`,
    })));
  }, [flat, window.start, window.end, focusedIndex]);
  const focusHandlers = (id: number) => ({
    onFocus: () => setFocusedId(id),
    onBlur: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.closest("tbody")?.contains(event.relatedTarget))) setFocusedId(null);
    },
  });
  const labels = [...selected.map(id => id === 1 ? "一次予算" : "確定予算"), ...(selected.length === 2 ? ["確定予算−一次予算"] : [])];
  return <PeriodScrollFrame container={container} label="展開表" layoutKey={selected.join(",")}><div id={expansionScrollRegionId} ref={container} {...rangeCopy.props} className="initiative-list-container" role="region" aria-label="展開表の月別種別・比較" tabIndex={0}>
      {rangeCopy.status}
      <table className={`initiative-list-table expansion-table${virtual ? " virtual-table" : ""}`} style={{ "--virtual-row-height": "28px" } as React.CSSProperties} aria-label="展開表" aria-rowcount={flat.length + 6}>
        {calculationError && <caption role="alert">絞り込み後の集計を計算できません。{calculationError}</caption>}
        <colgroup>
          <col className="expansion-group-col" /><col className="expansion-period-col" /><col className="expansion-category-col" /><col className="expansion-name-col" />
          {tablePeriods.flatMap(period => labels.flatMap((_, index) => ["sales", "profit"].map(metric =>
            <col key={`${period.id}-${index}-${metric}`} className="expansion-amount-col" />)))}
        </colgroup><thead>
        <tr>{["expansion", "period", "category", "name"].map((column, index) => <TableViewHeader key={column} view={tableView} column={column} rowSpan={3} className={["expansion-group", "expansion-period", "expansion-category", "expansion-name"][index]} />)}
          {tablePeriods.map(period => <th key={period.id} data-table-period={period.id} colSpan={labels.length * 2} scope="colgroup" className={periodCellClass(period, true)}>{period.label}</th>)}
        </tr>
        <tr>{tablePeriods.map(period => <Fragment key={period.id}>{labels.map((label, index) => <th key={index} scope="colgroup" colSpan={2} className={periodCellClass(period, index === 0)}>{label}</th>)}</Fragment>)}</tr>
        <tr>{tablePeriods.map(period => <Fragment key={period.id}>{labels.flatMap((_, index) => (["sales", "profit"] as const).map(key => <TableViewHeader key={`${index}-${key}`} view={tableView} column={`${period.id}:${selected[index] ?? "difference"}:${key}`} className={periodCellClass(period, key === "sales" && index === 0)} />))}</Fragment>)}</tr>
        <tr className="expansion-previous"><th colSpan={4} scope="row" className="expansion-summary">{previousRow.label}</th><AmountCells values={previousRow.values} copyRow={0} /></tr>
        <tr className="expansion-total"><th colSpan={4} scope="row" className="expansion-summary">{tableView.filtered ? "合計（絞り込み後）" : "合計"}</th><AmountCells values={table.total} error={calculationError} copyRow={1} /></tr>
        <tr className="expansion-total"><th colSpan={4} scope="row" className="expansion-summary">{tableView.filtered ? "展開計（表示中）" : "展開計"}</th><AmountCells values={table.changes} error={calculationError} copyRow={2} /></tr>
      </thead>
      {virtual ? <tbody><WindowRows items={rendered} count={flat.length} height={28} columns={4 + labels.length * tablePeriods.length * 2} render={({ row, range }, index) => {
        const firstGroup = row.groupOffset === 0 || index === range.start;
        const groupSpan = Math.min(row.groupCount - row.groupOffset, range.end - index);
        const firstPeriod = row.periodOffset === 0 || index === range.start;
        const firstCategory = row.categoryOffset === 0 || index === range.start;
        const categorySpan = Math.min(row.categoryCount - row.categoryOffset, range.end - index);
        const periodSpan = Math.min((row.period?.initiatives.length ?? 0) - row.periodOffset, range.end - index);
        return <tr data-expansion-start={row.groupOffset === 0 ? row.group.expansion.id : undefined} key={row.item?.id ?? `subtotal:${row.group.expansion.id}`} className={row.subtotal ? "expansion-subtotal" : undefined} aria-rowindex={index + 7}>
          {firstGroup && <ExpansionGroupCell cellProps={cellFilter.props("expansion", row.group.expansion.expansionName)} name={row.group.expansion.expansionName} span={groupSpan} title={row.group.expansion.expansionName} />}
          {row.subtotal ? <ExpansionSubtotalCells copyRow={index + 3} name={row.group.expansion.expansionName} values={row.group.values} filtered={tableView.filtered} error={calculationError} />
            : <ExpansionInitiativeCells copyRow={index + 3} cellFilter={cellFilter} item={row.item!} source={sourceInitiatives.get(row.item!.id)!} kind={selected[0]!} onOpen={onOpenInitiative}
              period={firstPeriod ? { name: row.period!.name, span: periodSpan } : null}
              category={firstCategory ? { name: categoryName(row.item!), span: categorySpan } : null}
              focusHandlers={focusHandlers(row.item!.id)} />}
        </tr>;
      }} /></tbody> : groups.map(({ group, periods }) => { return <tbody key={group.expansion.id}>
        {periods.map((period, periodIndex) => period.categories.flatMap((category, categoryGroupIndex) => category.initiatives.map((item, categoryIndex) => {
          const firstPeriod = categoryGroupIndex === 0 && categoryIndex === 0;
          return <tr key={item.id} data-expansion-start={periodIndex === 0 && firstPeriod ? group.expansion.id : undefined}>
          {periodIndex === 0 && firstPeriod && <ExpansionGroupCell cellProps={cellFilter.props("expansion", group.expansion.expansionName)} name={group.expansion.expansionName} span={group.initiatives.length + 1} />}
          <ExpansionInitiativeCells copyRow={copyIndices.get(`initiative:${item.id}`)!} cellFilter={cellFilter} item={item} source={sourceInitiatives.get(item.id)!} kind={selected[0]!} onOpen={onOpenInitiative}
            period={firstPeriod ? { name: period.name, span: period.initiatives.length } : null}
            category={categoryIndex === 0 ? { name: categoryName(item), span: category.initiatives.length } : null} />
        </tr>; }))) }
        <tr className="expansion-subtotal" data-expansion-start={group.initiatives.length === 0 ? group.expansion.id : undefined}>{group.initiatives.length === 0 && <ExpansionGroupCell cellProps={cellFilter.props("expansion", group.expansion.expansionName)} name={group.expansion.expansionName} />}
          <ExpansionSubtotalCells copyRow={copyIndices.get(`subtotal:${group.expansion.id}`)!} name={group.expansion.expansionName} values={group.values} filtered={tableView.filtered} error={calculationError} />
        </tr>
      </tbody>; })}{!groups.length && <TableViewEmpty columns={4 + labels.length * tablePeriods.length * 2} />}</table>
    </div>{cellFilter.menu}<ExpansionScrollbar container={container} targets={scrollTargets} virtual={virtual} /></PeriodScrollFrame>;
}
