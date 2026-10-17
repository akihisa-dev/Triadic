export type HistoryDifference = {
  section: string; subject: string; change: "追加" | "削除" | "変更";
  field: string; before: string; after: string;
};
export type HistoryIncomeValue = { yen: number; error?: never } | { yen?: never; error: string };
export type HistoryIncomeImpact = {
  kind: 1 | 2; period: number | "year"; metric: "sales" | "expense" | "profit";
  before: HistoryIncomeValue; after: HistoryIncomeValue; difference: HistoryIncomeValue;
};
export type HistoryComparison = { differences: HistoryDifference[]; impact: HistoryIncomeImpact[] };
