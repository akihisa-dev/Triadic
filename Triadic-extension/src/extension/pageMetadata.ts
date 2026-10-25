import type { Page } from "./workspace/types";
import type { SidebarIconName } from "./SidebarIcon";

export const pageMetadata = {
  "home": { name: "Home", master: false, icon: "home" },
  "initiative-list": { name: "施策一覧", master: false, icon: "list" },
  "initiative-entry": { name: "施策入力", master: false, icon: "entry" },
  "initiative-detail": { name: "施策詳細", master: false, icon: "entry" },
  "cost-table": { name: "総原価表", master: false, icon: "cost" },
  "expansion-table": { name: "展開表", master: false, icon: "expansion" },
  "previous-input": { name: "前年入力", master: false, icon: "previous" },
  "spreadsheet-io": { name: "入出力", master: false, icon: "io" },
  "data-history": { name: "履歴", master: false, icon: "history" },
  "master": { name: "マスタ", master: false, icon: "master" },
  "account-master": { name: "勘定科目マスタ", master: true, icon: "master" },
  "aggregation-master": { name: "集計マスタ", master: true, icon: "master" },
  "expansion-master": { name: "展開マスタ", master: true, icon: "master" },
  "expansion-category-master": { name: "展開区分マスタ", master: true, icon: "master" },
  "industry-master": { name: "業種マスタ", master: true, icon: "master" },
  "department-master": { name: "部署マスタ", master: true, icon: "master" },
  "period-master": { name: "期間マスタ", master: true, icon: "master" },
  "kind-master": { name: "種別マスタ", master: true, icon: "master" },
  "account-type-master": { name: "科目属性マスタ", master: true, icon: "master" },
  "amount-item-master": { name: "金額項目マスタ", master: true, icon: "master" },
} as const satisfies Record<Page, { name: string; master: boolean; icon: SidebarIconName }>;

export type MasterPageId = { [P in Page]: typeof pageMetadata[P]["master"] extends true ? P : never }[Page];
