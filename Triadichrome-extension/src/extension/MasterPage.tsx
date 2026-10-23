import { type ReactNode } from "react";
import { pageMetadata, type MasterPageId } from "./pageMetadata";

type MasterPageProps = { onOpenAmountItems: () => void; onOpenAccountTypes: () => void; onOpenAccounts: () => void; onOpenAggregations: () => void; onOpenExpansions: () => void; onOpenExpansionCategories: () => void; onOpenIndustries: () => void; onOpenDepartments: () => void; onOpenPeriods: () => void; onOpenKinds: () => void };

const icons: Record<MasterPageId, ReactNode> = {
  "account-master": <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h2m3 0h1M9 18h2m3 0h1" /></>,
  "aggregation-master": <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></>,
  "expansion-master": <><path d="M4 6h12m-4-4 4 4-4 4M20 18H8m4-4-4 4 4 4M4 12h16" /></>,
  "industry-master": <><path d="M3 21V9l8-4v16M11 21V3h10v18M2 21h20M6 11v1m0 3v1m9-9h2m-2 4h2m-2 4h2" /></>,
  "department-master": <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 11v-3a6 6 0 0 0-2-4" /></>,
  "period-master": <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18M7 15h3m4 0h3M7 18h3" /></>,
  "kind-master": <><path d="M3 4h9l9 9-8 8-10-10V4Z" /><circle cx="7.5" cy="8.5" r="1" /></>,
  "account-type-master": <><path d="M3 4h9l9 9-8 8-10-10V4Z" /><circle cx="7.5" cy="8.5" r="1" /><path d="m10 13 2 2 4-4" /></>,
  "amount-item-master": <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  "expansion-category-master": <><path d="M3 4h9l9 9-8 8-10-10V4Z" /><circle cx="7.5" cy="8.5" r="1" /><path d="m10 13 2 2 4-4" /></>,
};

export function MasterPage({ onOpenAmountItems, onOpenAccountTypes, onOpenAccounts, onOpenAggregations, onOpenExpansions, onOpenExpansionCategories, onOpenIndustries, onOpenDepartments, onOpenPeriods, onOpenKinds }: MasterPageProps) {
  const items = [
    { page: "aggregation-master", description: "総原価表の配置・集計への所属と加減", open: onOpenAggregations },
    { page: "account-master", description: "科目コード・名称・表示名・科目属性", open: onOpenAccounts },
    { page: "expansion-master", description: "展開コード・展開名・展開区分", open: onOpenExpansions },
    { page: "expansion-category-master", description: "展開区分名", open: onOpenExpansionCategories },
    { page: "industry-master", description: "業種コード・業種名", open: onOpenIndustries },
    { page: "department-master", description: "部署名・所属業種", open: onOpenDepartments },
    { page: "period-master", description: "期間名", open: onOpenPeriods },
    { page: "kind-master", description: "種別", open: onOpenKinds },
    { page: "account-type-master", description: "科目属性", open: onOpenAccountTypes },
    { page: "amount-item-master", description: "金額項目・表示順・構成", open: onOpenAmountItems },
  ] as const;
  return <main className="master-page master-index" aria-labelledby="master-title">
    <h1 id="master-title">マスタ</h1>
    <div className="master-menu">
      {items.map(item => <button key={item.page} className="master-menu-item" type="button" onClick={item.open}>
        <span className="master-menu-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{icons[item.page]}</svg>
        </span>
        <span className="master-menu-label"><strong>{pageMetadata[item.page].name}</strong><span>{item.description}</span></span>
        <svg className="master-menu-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
      </button>)}
    </div>
  </main>;
}
