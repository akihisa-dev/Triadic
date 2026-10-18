import type { Aggregation } from "../domain/aggregations";
import { childFirstAggregations } from "../domain/aggregationOrder";
import { masterRowKey, type MasterRow } from "../domain/masterRows";

export type AggregationRange = { id: number; name: string; lane: number; segments: { start: number; end: number; groupIndex: number | null }[] };

/** Use the saved cost-table order. Split gaps so unrelated rows are never enclosed. */
export function aggregationRanges(order: MasterRow[], groups: Aggregation[]): AggregationRange[] {
  const positions = new Map(order.map((row, index) => [masterRowKey(row), index]));
  const indices = new Map<number, Set<number>>();
  for (const group of childFirstAggregations(groups)) {
    const members = new Set<number>();
    const own = positions.get(`group:${group.id}`);
    if (own !== undefined) members.add(own);
    for (const member of group.members) {
      if (member.kind === "group") for (const index of indices.get(member.id) ?? []) members.add(index);
      else {
        const index = positions.get(masterRowKey(member));
        if (index !== undefined) members.add(index);
      }
    }
    indices.set(group.id, members);
  }
  const ranges = groups.map(group => ({ group, sorted: [...indices.get(group.id) ?? []].sort((a, b) => a - b) }))
    .filter(item => item.sorted.length > 0 && item.group.members.length > 0).sort((a, b) => (b.sorted.at(-1)! - b.sorted[0]!) - (a.sorted.at(-1)! - a.sorted[0]!));
  const lanes: { start: number; end: number }[][] = [];
  return ranges.map(({ group, sorted }) => {
    const start = sorted[0]!, end = sorted.at(-1)!;
    let lane = 0;
    while (lanes[lane]?.some(other => !(end < other.start || start > other.end))) lane++;
    (lanes[lane] ??= []).push({ start, end });
    const segments: AggregationRange["segments"] = [];
    const own = positions.get(`group:${group.id}`);
    for (const index of sorted) {
      const previous = segments.at(-1);
      if (previous && previous.end === index - 1) {
        previous.end = index;
        if (index === own) previous.groupIndex = index;
      } else segments.push({ start: index, end: index, groupIndex: index === own ? index : null });
    }
    return { id: group.id, name: group.name, lane, segments };
  });
}

/** Move a group together with its descendants, preserving their saved relative order. */
export function placedMasterRows(order: MasterRow[], groups: Aggregation[], source: MasterRow, target: MasterRow): MasterRow[] {
  const moving = new Set([masterRowKey(source)]);
  if (source.kind === "group") {
    const byId = new Map(groups.map(group => [group.id, group]));
    const pending = [source.id];
    while (pending.length) {
      const group = byId.get(pending.pop()!);
      for (const member of group?.members ?? []) {
        const key = masterRowKey(member);
        if (moving.has(key)) continue;
        moving.add(key);
        if (member.kind === "group") pending.push(member.id);
      }
    }
  }
  if (moving.has(masterRowKey(target))) throw new Error("自身や配下の行へ移動できません。");
  const remaining = order.filter(row => !moving.has(masterRowKey(row)));
  const at = remaining.findIndex(row => masterRowKey(row) === masterRowKey(target));
  if (at < 0) throw new Error("移動先が見つかりません。");
  remaining.splice(at, 0, ...order.filter(row => moving.has(masterRowKey(row))));
  return remaining;
}
