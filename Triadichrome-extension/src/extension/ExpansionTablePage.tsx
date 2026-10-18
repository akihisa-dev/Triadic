import type { ExpansionMonths } from "../core/tables/expansionTable";
import { useRowWindow, WindowRows } from "./VirtualTableRows";
import { TableCalculationBoundary } from "./TableCalculationBoundary";
import { periodCellClass } from "./periodCellStyle";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Fragment, memo, useMemo, useRef, useState } from "react";
import { expansionPeriodAmount, tablePeriods } from "../core/tables/periodTables";
import { type Initiative, type PlanContents } from "../core/domain/plan";
import { createExpansionTableView } from "../core/tables/expansionTableView";
import type { KindId } from "../core/domain/kinds";
import { formatTableYen } from "./tableNumberFormat";

type Props = {
  contents: PlanContents; selected: KindId[]; selection: ReactNode;
  onOpenInitiative: (initiative: Initiative, kind: KindId) => void;
};
const AmountCells = memo(function AmountCells({ values }: { values: ExpansionMonths[] }) {
  return tablePeriods.map(period => <Fragment key={period.id}>{values.map((months, index) => <Fragment key={index}>
    {(["sales", "profit"] as const).map(metric => {
      const amount = expansionPeriodAmount(months, period, metric);
      const text = amount === null ? "属性未設定" : formatTableYen(amount);
      return <td key={metric} title={text} className={periodCellClass(period, metric === "sales" && index === 0, metric === "profit" && index === values.length - 1)}>{text}</td>;
    })}
  </Fragment>)}</Fragment>);
});
type ExpansionItem = NonNullable<ReturnType<ReturnType<typeof createExpansionTableView>>["flat"][number]["item"]>;
function ExpansionGroupCell({ name, span, title }: { name: string; span?: number; title?: string }) {
  return <th rowSpan={span} scope="rowgroup" className="expansion-group" title={title}>{name}</th>;
}
function ExpansionSubtotalCells({ name, values }: { name: string; values: ExpansionMonths[] }) {
  return <><th colSpan={3} scope="row" className="expansion-subtotal-name">{name}計</th><AmountCells values={values} /></>;
}
/** Row content and navigation are identical; each renderer owns spans and focus retention. */
function ExpansionInitiativeCells({ item, source, kind, onOpen, period, category, focusHandlers }: {
  item: ExpansionItem; source: Initiative; kind: KindId; onOpen: Props["onOpenInitiative"];
  period: { name: string; span: number } | null; category: { name: string; span: number } | null;
  focusHandlers?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onFocus" | "onBlur">;
}) {
  return <>
    {period && <th rowSpan={period.span} className="expansion-period">{period.name}</th>}
    {category && <td rowSpan={category.span} className="expansion-category" title={category.name}>{category.name}</td>}
    <th scope="row" className="expansion-name"><button className="initiative-name-button" type="button" {...focusHandlers}
      title={item.note || item.name} onClick={() => onOpen(source, kind)}>{item.name}</button></th>
    <AmountCells values={item.values} />
  </>;
}
export function ExpansionTablePage({ contents, selected, selection, onOpenInitiative }: Props) {
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
    [contents.initiatives, contents.accounts, contents.previousAmounts, contents.expansions, contents.periodTypes, contents.expansionCategories, contents.fiscalYear]);
  const { table, groups, flat } = viewForSelection(selected);
  const categoryNames = useMemo(() => new Map(contents.expansionCategories.map(category => [category.id, category.categoryName])), [contents.expansionCategories]);
  const sourceInitiatives = useMemo(() => new Map(contents.initiatives.map(item => [item.id, item])), [contents.initiatives]);
  const categoryName = (item: Pick<Initiative, "expansionCategoryId">) => item.expansionCategoryId == null ? "" : categoryNames.get(item.expansionCategoryId) ?? "";
  const container = useRef<HTMLDivElement>(null);
  const window = useRowWindow(container, flat.length, 28, 200, 165);
  const virtual = flat.length > 200;
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
  const labels = [...selected.map(id => contents.kinds.find(kind => kind.id === id)!.kindName), ...(selected.length === 2 ? ["比較"] : [])];
  return <div ref={container} className="initiative-list-container" role="region" aria-label="展開表の月別種別・比較" tabIndex={0}>
      <table className={`initiative-list-table expansion-table${virtual ? " virtual-table" : ""}`} style={{ "--virtual-row-height": "28px" } as React.CSSProperties} aria-label="展開表" aria-rowcount={flat.length + 6}>
        <colgroup>
          <col className="expansion-group-col" /><col className="expansion-period-col" /><col className="expansion-category-col" /><col className="expansion-name-col" />
          {tablePeriods.flatMap(period => labels.flatMap((_, index) => ["sales", "profit"].map(metric =>
            <col key={`${period.id}-${index}-${metric}`} className="expansion-amount-col" />)))}
        </colgroup><thead>
        <tr><th rowSpan={3} scope="col" className="expansion-group">展開名</th>
          <th rowSpan={3} scope="col" className="expansion-period">期間名</th>
          <th rowSpan={3} scope="col" className="expansion-category">展開区分</th>
          <th rowSpan={3} scope="col" className="expansion-name">施策名</th>
          {tablePeriods.map(period => <th key={period.id} colSpan={labels.length * 2} scope="colgroup" className={periodCellClass(period, true)}>{period.label}</th>)}
        </tr>
        <tr>{tablePeriods.map(period => <Fragment key={period.id}>{labels.map((label, index) => <th key={index} scope="colgroup" colSpan={2} className={periodCellClass(period, index === 0)}>{label}</th>)}</Fragment>)}</tr>
        <tr>{tablePeriods.map(period => <Fragment key={period.id}>{labels.flatMap((_, index) => (["sales", "profit"] as const).map(key => <th key={`${index}-${key}`} scope="col" className={periodCellClass(period, key === "sales" && index === 0)}>{key === "sales" ? "売上" : "利益"}</th>))}</Fragment>)}</tr>
        <tr className="expansion-previous"><th colSpan={4} scope="row" className="expansion-summary">前年</th><AmountCells values={table.previous} /></tr>
        <tr className="expansion-total"><th colSpan={4} scope="row" className="expansion-summary">合計</th><AmountCells values={table.total} /></tr>
        <tr className="expansion-total"><th colSpan={4} scope="row" className="expansion-summary">展開計</th><AmountCells values={table.changes} /></tr>
      </thead>
      {virtual ? <tbody><WindowRows items={rendered} count={flat.length} height={28} columns={4 + labels.length * tablePeriods.length * 2} render={({ row, range }, index) => {
        const firstGroup = row.groupOffset === 0 || index === range.start;
        const groupSpan = Math.min(row.groupCount - row.groupOffset, range.end - index);
        const firstPeriod = row.periodOffset === 0 || index === range.start;
        const firstCategory = row.categoryOffset === 0 || index === range.start;
        const categorySpan = Math.min(row.categoryCount - row.categoryOffset, range.end - index);
        const periodSpan = Math.min((row.period?.initiatives.length ?? 0) - row.periodOffset, range.end - index);
        return <tr key={row.item?.id ?? `subtotal:${row.group.expansion.id}`} className={row.subtotal ? "expansion-subtotal" : undefined} aria-rowindex={index + 7}>
          {firstGroup && <ExpansionGroupCell name={row.group.expansion.expansionName} span={groupSpan} title={row.group.expansion.expansionName} />}
          {row.subtotal ? <ExpansionSubtotalCells name={row.group.expansion.expansionName} values={row.group.values} />
            : <ExpansionInitiativeCells item={row.item!} source={sourceInitiatives.get(row.item!.id)!} kind={selected[0]!} onOpen={onOpenInitiative}
              period={firstPeriod ? { name: row.period!.name, span: periodSpan } : null}
              category={firstCategory ? { name: categoryName(row.item!), span: categorySpan } : null}
              focusHandlers={focusHandlers(row.item!.id)} />}
        </tr>;
      }} /></tbody> : groups.map(({ group, periods }) => { return <tbody key={group.expansion.id}>
        {periods.map((period, periodIndex) => period.categories.flatMap((category, categoryGroupIndex) => category.initiatives.map((item, categoryIndex) => {
          const firstPeriod = categoryGroupIndex === 0 && categoryIndex === 0;
          return <tr key={item.id}>
          {periodIndex === 0 && firstPeriod && <ExpansionGroupCell name={group.expansion.expansionName} span={group.initiatives.length + 1} />}
          <ExpansionInitiativeCells item={item} source={sourceInitiatives.get(item.id)!} kind={selected[0]!} onOpen={onOpenInitiative}
            period={firstPeriod ? { name: period.name, span: period.initiatives.length } : null}
            category={categoryIndex === 0 ? { name: categoryName(item), span: category.initiatives.length } : null} />
        </tr>; }))) }
        <tr className="expansion-subtotal">{group.initiatives.length === 0 && <ExpansionGroupCell name={group.expansion.expansionName} />}
          <ExpansionSubtotalCells name={group.expansion.expansionName} values={group.values} />
        </tr>
      </tbody>; })}</table>
    </div>;
}
