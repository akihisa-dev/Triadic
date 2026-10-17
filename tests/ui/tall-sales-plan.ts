import { createTriadicDatabase } from "../../Triadichrome-extension/src/core/storage/triadicDatabase";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import { changeAggregationMaster } from "../../Triadichrome-extension/src/core/storage/aggregationMaster";
import { orderedMasterRows } from "../../Triadichrome-extension/src/core/domain/masterRows";
export async function createTallSalesPlan() {
  const bytes = await createTriadicDatabase(2026);
  const plan = await readPlanContents(bytes);
  const sales = plan.aggregations.find(group => group.required === "sales")!;
  const target = plan.accounts.find(account => account.accountName === "貸倒引当金繰入額")!;
  const order = orderedMasterRows(plan.accounts, plan.aggregations).filter(row => row.kind !== "group" || row.id !== sales.id);
  order.splice(order.findIndex(row => row.kind === "account" && row.id === target.id), 0, {kind:"group",id:sales.id});
  return changeAggregationMaster(bytes, {type:"reorder",order});
}
