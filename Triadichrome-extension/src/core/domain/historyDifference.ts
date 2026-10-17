export type HistoryDifference = {
  section: string; subject: string; change: "追加" | "削除" | "変更";
  field: string; before: string; after: string;
};
