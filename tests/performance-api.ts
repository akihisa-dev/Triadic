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
export function renderCostTable(contents: PlanContents) {
  return renderToStaticMarkup(createElement(CostTablePage, { contents, selected: [1], selection: null, view: { current: { industries: [], departments: [], top: 0, left: 0 } }, navigationBlocked: false, onOpenInitiative() {} }));
}

import { ExpansionTablePage } from "../Triadic-extension/src/extension/ExpansionTablePage";
export function renderExpansionTable(contents: PlanContents, selected: KindId[] = [1]) {
  return renderToStaticMarkup(createElement(ExpansionTablePage, { contents, selected, selection: null, onOpenInitiative() {} }));
}
export { createSignedCategoryPlan } from "./ui/sample-plan";
