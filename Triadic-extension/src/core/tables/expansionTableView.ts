import type { KindId } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import { createExpansionGrouping, groupExpansionCategories, groupExpansionPeriods, totalInitiatives } from "./expansionTable";
import { buildKindExpansionTable, combineTotals } from "./planTables";
import { selectTableRows, type TableColumn, type TableViewState } from "./columnView";

function buildView(contents: PlanContents, selected: KindId[], grouping: ReturnType<typeof createExpansionGrouping>) {
  const table = buildKindExpansionTable(contents, selected, "registered", { comparePrevious: false });
  return shapeView(table, grouping, selected);
}
function shapeView(table: ReturnType<typeof buildKindExpansionTable>, grouping: ReturnType<typeof createExpansionGrouping>, selected: KindId[], state?: TableViewState) {
  const order = <T>(rows: T[], column: string, value: (row: T) => string) => state?.sort?.column === column
    ? selectTableRows(rows, [{ id: column, label: column, value }], { sort: state.sort, filters: {} }) : rows;
  const orderedGroups = order(table.groups, "expansion", group => group.expansion.expansionName);
  const groups = orderedGroups.map(group => ({ group, periods: order(groupExpansionPeriods(group.initiatives, grouping.periods), "period", period => period.name).map(period => {
    const categories = order(groupExpansionCategories(period.initiatives, grouping.categories), "category", category => grouping.categories.get(category.id!)?.name ?? "");
    return { ...period, categories, initiatives: categories.flatMap(category => category.initiatives) };
  }) }));
  const flat = groups.flatMap(({ group, periods }) => {
    const count = group.initiatives.length + 1;
    let offset = 0;
    const items = periods.flatMap(period => {
      let periodOffset = 0;
      return period.categories.flatMap(category => category.initiatives.map((item, categoryOffset) => ({
        group, item, period, groupOffset: offset++, groupCount: count, periodOffset: periodOffset++,
        categoryOffset, categoryCount: category.initiatives.length, subtotal: false,
      })));
    });
    return [...items, { group, item: null, period: null, groupOffset: offset, groupCount: count, periodOffset: 0, categoryOffset: 0, categoryCount: 0, subtotal: true }];
  });
  return { table, groups, flat, selected, calculationError: "" };
}

export type ExpansionView = ReturnType<typeof buildView>;
export type ExpansionViewItem = ExpansionView["table"]["groups"][number]["initiatives"][number];
/** Rebuild spans and totals from visible members; keep each period/category together. */
export function selectExpansionView(base: ExpansionView, contents: PlanContents, columns: TableColumn<ExpansionViewItem>[], state: TableViewState): ExpansionView {
  const filtered = columns.some(column => state.filters[column.id]);
  if (!filtered && !state.sort) return base;
  let calculationError = "";
  const calculate = (operation: () => typeof base.table.changes[number]) => {
    try { return operation(); }
    catch (failure) {
      calculationError = (failure as Error).message;
      return Object.fromEntries(Object.keys(base.table.changes[0]!).map(month => [month, { sales: null, profit: null }]));
    }
  };
  const groups = base.table.groups.map(group => {
    const initiatives = selectTableRows(group.initiatives, columns, state);
    const values = filtered ? group.values.map((_, index) => calculate(() => totalInitiatives(initiatives.map(item => ({ months: item.values[index]! }))))) : group.values;
    return { ...group, initiatives, values, total: filtered ? values[0]! : group.total };
  }).filter(group => !filtered || group.initiatives.length > 0);
  const members = groups.flatMap(group => group.initiatives);
  const changes = filtered ? base.table.changes.map((_, index) => calculate(() => totalInitiatives(members.map(item => ({ months: item.values[index]! }))))) : base.table.changes;
  const budgets = filtered ? changes.slice(0, base.selected.length).map((amounts, index) => calculate(() => combineTotals(base.table.previous[index]!, amounts))) : [];
  const total = !filtered ? base.table.total : base.selected.length === 2
    ? [...budgets, calculate(() => combineTotals(budgets[base.selected.indexOf(2)]!, budgets[base.selected.indexOf(1)]!, -1))] : budgets;
  return { ...shapeView({ ...base.table, groups, changes, total }, createExpansionGrouping(contents), base.selected, state), calculationError };
}

// The caller replaces this cache whenever immutable calculation inputs change.
// Selection order is significant; at most four valid combinations are retained.
export function createExpansionTableView(contents: PlanContents) {
  const grouping = createExpansionGrouping(contents);
  const cache = new Map<string, ReturnType<typeof buildView>>();
  return (selected: KindId[]) => {
    const key = selected.join(",");
    let view = cache.get(key);
    if (!view) {
      view = buildView(contents, selected, grouping);
      cache.set(key, view);
    }
    return view;
  };
}
