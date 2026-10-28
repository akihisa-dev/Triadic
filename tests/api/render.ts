export * from "../../Triadic-extension/src/extension/AmountItemMasterPage";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardPage } from "../../Triadic-extension/src/extension/DashboardPage";
import type { PlanContents } from "../../Triadic-extension/src/core/domain/plan";
import type { KindId } from "../../Triadic-extension/src/core/domain/kinds";
export function renderDashboard(contents: PlanContents, selected: KindId[] = [1]) {
  return renderToStaticMarkup(createElement(DashboardPage, { contents, selected, previous: contents.budgetPrevious ?? { 1: 1, 2: 1 }, disabled: false,
    onSelection() {}, onDepartment() {}, onInitiative() {} }));
}
export * from "../../Triadic-extension/src/extension/MasterPage";
export * from "../../Triadic-extension/src/extension/AccountTypeMasterPage";
export * from "../../Triadic-extension/src/extension/HomeRelationsPage";
export * from "../../Triadic-extension/src/extension/tableNumberFormat";
export { revealTableRangeCell } from "../../Triadic-extension/src/extension/tableRangeVisibility";

export { layoutHomeRelations, homeRelationLine, relationDescription, tablePages } from "../../Triadic-extension/src/extension/home/homeRelationLayout";
export { nodes as homeDestinations, edges as homeRelations } from "../../Triadic-extension/src/extension/home/homeRelations";

export { moveTableRangeSelection, describeTableRange } from "../../Triadic-extension/src/core/tables/tableRangeSelection";
export { useTableRangeCopy } from "../../Triadic-extension/src/extension/useTableRangeCopy";
