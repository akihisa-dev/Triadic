import { readMasterPresentation } from "./masterPresentation";
import type { Database } from "./sqliteRuntime";
import type { Aggregation, AggregationMember, RequiredAggregation } from "../domain/aggregations";
export function listAggregations(database: Database): Aggregation[] {
  const {ranks} = readMasterPresentation(database);
  const members = database.exec("SELECT parent_id, account_id, group_id, sign FROM aggregation_members ORDER BY parent_id, position")[0]?.values ?? [];
  const membersByParent = new Map<number, AggregationMember[]>();
  for (const [parentId, accountId, groupId, sign] of members) {
    const id = Number(parentId);
    const member: AggregationMember = { kind: accountId === null ? "group" : "account", id: Number(accountId ?? groupId), sign: Number(sign) as 1 | -1 };
    const selected = membersByParent.get(id);
    if (selected) selected.push(member);
    else membersByParent.set(id, [member]);
  }
  return (database.exec(`SELECT aggregation_groups.id, name, required_key, display_name FROM aggregation_groups JOIN master_order ON master_order.aggregation_group_id = aggregation_groups.id ORDER BY master_order.position`)[0]?.values ?? []).map(([id, name, required, displayName]) => ({
    ...(ranks.has(`group:${id}`) ? {masterOrder:ranks.get(`group:${id}`)!} : {}),
    ...(displayName === null ? {} : { displayName: String(displayName) }),
    id: Number(id), name: String(name), required: required === null ? null : required as RequiredAggregation,
    members: membersByParent.get(Number(id)) ?? [],
  }));
}
