export type TableValue = string | number | readonly string[] | null | undefined;
export type TableColumn<T> = { id: string; label: string; name?: string; type?: "text" | "choice" | "number"; value: (row: T) => TableValue; sortValue?: (row: T) => TableValue; scale?: number; sortable?: boolean };
export type TableFilter = { type: "text"; text: string; exact?: boolean } | { type: "choice"; values: string[] }
  | { type: "number"; operator: "negative" | "positive" | "zero" | "nonzero" | "blank" | "range"; min?: number; max?: number };
export type TableSort = { column: string; direction: "ascending" | "descending" };
export type TableViewState = { sort: TableSort | null; filters: Record<string, TableFilter> };
export const emptyTableView = (): TableViewState => ({ sort: null, filters: {} });
const collator = new Intl.Collator("ja", { numeric: true });
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja");
export const tableValueText = (value: TableValue): string => Array.isArray(value) ? value.join("・") : value == null ? "" : String(value);
export const tableChoices = (value: TableValue): string[] => Array.isArray(value) ? value.length ? [...value] : [""] : [tableValueText(value)];

export function matchesTableFilter(value: TableValue, filter: TableFilter): boolean {
  if (filter.type === "choice") return tableChoices(value).some(item => filter.values.includes(item));
  if (filter.type === "text" && filter.exact) return tableValueText(value) === filter.text;
  if (filter.type === "text") return normalized(filter.text).trim().split(/\s+/).every(word => normalized(tableValueText(value)).includes(word));
  if (filter.operator === "blank") return value == null;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  switch (filter.operator) {
    case "negative": return value < 0;
    case "positive": return value > 0;
    case "zero": return value === 0;
    case "nonzero": return value !== 0;
    case "range": return (filter.min === undefined || value >= filter.min) && (filter.max === undefined || value <= filter.max);
  }
}
/** Presentation only: never mutate source rows or compare rounded display amounts. */
export function selectTableRows<T>(rows: readonly T[], columns: readonly TableColumn<T>[], state: TableViewState): T[] {
  const active = columns.filter(column => state.filters[column.id]);
  const filtered = active.length ? rows.filter(row => active.every(column => matchesTableFilter(column.value(row), state.filters[column.id]!))) : [...rows];
  const column = columns.find(column => column.id === state.sort?.column && column.sortable !== false);
  if (!column || !state.sort) return filtered;
  const direction = state.sort.direction === "ascending" ? 1 : -1;
  return filtered.map((row, index) => ({ row, index, value: (column.sortValue ?? column.value)(row) })).sort((a, b) => {
    const blankA = a.value == null || tableValueText(a.value) === "", blankB = b.value == null || tableValueText(b.value) === "";
    if (blankA || blankB) return Number(blankA) - Number(blankB) || a.index - b.index;
    const compared = typeof a.value === "number" && typeof b.value === "number" ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)
      : collator.compare(tableValueText(a.value), tableValueText(b.value));
    return compared * direction || a.index - b.index;
  }).map(item => item.row);
}
