import { createRoot } from "react-dom/client";
import { useState } from "react";
import { DashboardPage } from "../../Triadic-extension/src/extension/DashboardPage";
import { createSamplePlan } from "./sample-plan";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import type { KindId, BudgetPrevious } from "../../Triadic-extension/src/core/domain/kinds";
import { WindowViewContext } from "../../Triadic-extension/src/extension/windowView";
import type { WindowViewValues } from "../../Triadic-extension/src/extension/windowViewState";
import "../../Triadic-extension/src/extension/ExtensionPage.css";

if (!import.meta.env.DEV) throw new Error("開発サーバー専用です。");
const plan = await readPlanContents(await createSamplePlan());
const mode = new URLSearchParams(location.search).get("mode");
const sales = plan.accounts.find(account => account.accountType === "sales")!, expense = plan.accounts.find(account => account.accountType === "expense")!;
const source = plan.initiatives[0]!;
plan.previousAmounts = [];
plan.initiatives = mode === "zero" ? [] : [{ ...source, name: "境界確認", expansionId: null, expansionCategoryId: null, industryId: null, departmentId: null, periodTypeId: null, rows: [
  { accountId: sales.id, amounts: { 4: "-100", 5: "100" }, overrides: { 2: { 4: "0", 5: "300" } } },
  { accountId: expense.id, amounts: { 4: "-10", 5: "-20" } },
] }];
if (mode === "negative") plan.initiatives[0]!.rows[0]!.amounts[5] = "0";
if (mode === "axis-positive" || mode === "axis-negative") plan.initiatives = [{ ...source, name: "軸余白の境界", rows: [
  { accountId: sales.id, amounts: { 4: mode === "axis-positive" ? "8500000000000" : "-8500000000000" } },
] }];
if (mode === "long") {
  plan.expansions = plan.expansions.map(item => ({ ...item, expansionName: item.expansionName.repeat(15) }));
  plan.industries = plan.industries.map(item => ({ ...item, industryName: item.industryName.repeat(15) }));
  plan.accounts = plan.accounts.map(item => ({ ...item, accountName: item.accountName.repeat(10) }));
}
if (mode === "scatter-labels") {
  plan.initiatives = [];
  plan.industries = plan.industries.map((item, i) => ({ ...item, industryName: i === 0 ? "同じ位置に重なる長い業種名を省略せず確認するための業種" : item.industryName }));
  plan.previousAmounts = plan.industries.map((industry, i) => ({ id: i + 1, revision: 1, previousKind: 1, accountId: sales.id, industryId: industry.id, departmentId: plan.departments[0]!.id, month: 4, amount: "1000" }));
}
const view: WindowViewValues = {};
function Fixture() {
  const [kinds, setKinds] = useState<KindId[]>([1, 2]);
  const [previous, setPrevious] = useState<BudgetPrevious>({1:1,2:1});
  return <WindowViewContext value={view}><DashboardPage contents={plan} selected={kinds} previous={previous} disabled={false} onSelection={(kinds, previous) => { setKinds(kinds); setPrevious(previous); }} onDepartment={() => {}} onInitiative={() => {}} /></WindowViewContext>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
