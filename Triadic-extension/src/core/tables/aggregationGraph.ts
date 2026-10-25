import type { AggregationMember, Aggregation } from "../domain/aggregations";

export function aggregationForbidden(byId: ReadonlyMap<number, Aggregation>, selected: Pick<AggregationMember, "kind" | "id"> | null) {
  const ids = new Set<number>();
  if (selected?.kind === "group") {
    const queue = [selected.id];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]!;
      if (ids.has(id)) continue;
      ids.add(id);
      queue.push(...(byId.get(id)?.members.filter(member => member.kind === "group").map(member => member.id) ?? []));
    }
  }
  return ids;
}
