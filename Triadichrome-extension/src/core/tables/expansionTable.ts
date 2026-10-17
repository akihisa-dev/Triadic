import { sumYen } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import type { InitiativeForMetrics } from "./initiatives";
import { type PlanContents } from "../domain/plan";

export type ExpansionInitiative = InitiativeForMetrics<"sales" | "profit">;
export type ExpansionMonths = ExpansionInitiative["months"];
export type ExpansionSort = "registered" | "asc" | "desc";
export type ExpansionTotals = Record<number, { sales: number | null; profit: number | null }>;
const nameOrder = new Intl.Collator("ja", { numeric: true });

export function totalInitiatives(initiatives: { months: ExpansionMonths }[]): ExpansionTotals {
  return Object.fromEntries(initiativeMonths.map(month => {
    const values = initiatives.map(item => item.months[month]);
    const sum = (key: "sales" | "profit") => values.some(value => value?.[key] === null) ? null
      : sumYen(values.map(value => value?.[key] ?? 0));
    return [month, { sales: sum("sales"), profit: sum("profit") }];
  }));
}

export function buildExpansionTable<T extends ExpansionInitiative>(contents: Omit<PlanContents, "initiatives"> & { initiatives: T[] }, fiscalYear: number, sort: ExpansionSort) {
  const visible = contents.initiatives.filter(item => item.fiscalYear === fiscalYear);
  const members = new Map<number, T[]>();
  for (const item of visible) {
    if (item.expansionId === null) continue;
    const group = members.get(item.expansionId) ?? [];
    group.push(item);
    members.set(item.expansionId, group);
  }
  const expansions = [...contents.expansions].sort((a, b) => a.expansionCode.length - b.expansionCode.length
    || (a.expansionCode < b.expansionCode ? -1 : a.expansionCode > b.expansionCode ? 1 : a.id - b.id));
  return {
    total: totalInitiatives(visible),
    groups: expansions.map(expansion => {
      const initiatives = members.get(expansion.id) ?? [];
      if (sort !== "registered") initiatives.sort((a, b) => nameOrder.compare(a.name, b.name) * (sort === "asc" ? 1 : -1));
      return { expansion, initiatives, total: totalInitiatives(initiatives) };
    }),
  };
}

type GroupingIndex = ReadonlyMap<number, { name: string; position: number }>;
const periodIndex = (periods: PlanContents["periodTypes"]): GroupingIndex => new Map(periods.map((period, position) => [period.id, { name: period.periodName, position }]));
const categoryIndex = (categories: PlanContents["expansionCategories"]): GroupingIndex => new Map(categories.map((category, position) => [category.id, { name: category.categoryName, position }]));
/** Share master lookup and ordering across all expansions, periods, and budget selections. */
export function createExpansionGrouping(contents: Pick<PlanContents, "periodTypes" | "expansionCategories">) {
  return { periods: periodIndex(contents.periodTypes), categories: categoryIndex(contents.expansionCategories) };
}

/** Group only present periods; retain registration order within each period. */
export function groupExpansionPeriods<T extends { periodTypeId?: number | null }>(initiatives: T[], periods: PlanContents["periodTypes"] | GroupingIndex) {
  if (!initiatives.length) return [];
  const index = Array.isArray(periods) ? periodIndex(periods) : periods;
  const members = new Map<number | null, T[]>();
  for (const item of initiatives) {
    const id = item.periodTypeId != null && index.has(item.periodTypeId) ? item.periodTypeId : null;
    const items = members.get(id) ?? [];
    items.push(item); members.set(id, items);
  }
  return [...members].sort(([a], [b]) => (a === null ? Infinity : index.get(a)!.position) - (b === null ? Infinity : index.get(b)!.position))
    .map(([id, items]) => ({ id, name: id === null ? "" : index.get(id)!.name, initiatives: items }));
}

/** Group only present subcategories using the shared master order. */
export function groupExpansionCategories<T extends { expansionCategoryId?: number | null }>(initiatives: T[], categories: PlanContents["expansionCategories"] | GroupingIndex) {
  if (!initiatives.length) return [];
  const index = Array.isArray(categories) ? categoryIndex(categories) : categories;
  const members = new Map<number | null, T[]>();
  for (const item of initiatives) {
    const id = item.expansionCategoryId ?? null;
    if (id !== null && !index.has(id)) continue;
    const items = members.get(id) ?? [];
    items.push(item); members.set(id, items);
  }
  return [...members].sort(([a], [b]) => (a === null ? Infinity : index.get(a)!.position) - (b === null ? Infinity : index.get(b)!.position))
    .map(([id, items]) => ({ id, initiatives: items }));
}
