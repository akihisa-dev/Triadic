export * from './core-api';
export { initializeSqlite } from '../Triadic-extension/src/core/storage/sqliteRuntime';
export { visibleRows } from '../Triadic-extension/src/core/tables/visibleRows';
export { processingTasks } from '../Triadic-extension/src/extension/planProcessingTasks';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InitiativeListPage } from '../Triadic-extension/src/extension/InitiativeListPage';
import type { KindId } from '../Triadic-extension/src/core/domain/kinds';
import type { PlanContents } from '../Triadic-extension/src/core/domain/plan';
export function renderInitiativeList(contents: PlanContents, selectedKind: KindId = 1) {
  return renderToStaticMarkup(createElement(InitiativeListPage, {
    selection: null, selectedKind, initiatives: contents.initiatives, accounts: contents.accounts,
    expansions: contents.expansions, periodTypes: contents.periodTypes,
    fiscalYear: String(contents.fiscalYear), onAddInitiative() {}, onOpenInitiative() {}, navigationBlocked: false,
  }));
}

export { createInitiativeListView } from "../Triadic-extension/src/core/tables/initiativeListView";
export { createExpansionTableView } from "../Triadic-extension/src/core/tables/expansionTableView";

import { CostTablePage } from '../Triadic-extension/src/extension/CostTablePage';
export function renderCostTable(contents: PlanContents, selected: KindId[] = [1]) {
  return renderToStaticMarkup(createElement(CostTablePage, { contents, selected, selection: null, view: { current: { industries: [], departments: [], top: 0, left: 0 } }, navigationBlocked: false, onOpenInitiative() {} }));
}

import { ExpansionTablePage } from "../Triadic-extension/src/extension/ExpansionTablePage";
export function renderExpansionTable(contents: PlanContents, selected: KindId[] = [1]) {
  return renderToStaticMarkup(createElement(ExpansionTablePage, { contents, selected, selection: null, onOpenInitiative() {} }));
}
export { createSignedCategoryPlan } from "./ui/sample-plan";

import { ComparisonSelection } from '../Triadic-extension/src/extension/ComparisonSelection';
import type { BudgetPrevious } from '../Triadic-extension/src/core/domain/kinds';
import { Children, isValidElement, type ReactNode } from 'react';
export function comparisonSelectionChange(selected: KindId[], previous: BudgetPrevious, label: string) {
  let result = { selected, previous };
  const tree = ComparisonSelection({ selected, previous, independentPrevious: true, onChange: (selected, previous) => { result = { selected, previous }; } });
  function visit(node: ReactNode): boolean {
    for (const child of Children.toArray(node)) {
      if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string; onChange?: () => void }>(child)) continue;
      if (child.props['aria-label'] === label) { child.props.onChange!(); return true; }
      if (visit(child.props.children)) return true;
    }
    return false;
  }
  if (!visit(tree)) throw new Error(`選択欄が見つかりません: ${label}`);
  return result;
}
