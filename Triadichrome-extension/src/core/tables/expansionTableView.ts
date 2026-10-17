import type { KindId } from "../domain/kinds";
import type { PlanContents } from "../domain/plan";
import { createExpansionGrouping, groupExpansionCategories, groupExpansionPeriods } from "./expansionTable";
import { buildKindExpansionTable } from "./planTables";

function buildView(contents: PlanContents, selected: KindId[], grouping: ReturnType<typeof createExpansionGrouping>) {
  const table = buildKindExpansionTable(contents, selected, "registered");
  const groups = table.groups.map(group => ({ group, periods: groupExpansionPeriods(group.initiatives, grouping.periods).map(period => {
    const categories = groupExpansionCategories(period.initiatives, grouping.categories);
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
  return { table, groups, flat };
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
