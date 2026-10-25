import type { PlanContents } from "./plan";
export type PlanContentsPatch = { path: (string | number)[]; value?: unknown; remove?: boolean }[];

/** Bound change descriptions; broad edits use the existing complete snapshot. */
export function diffPlanContents(before: PlanContents, after: PlanContents, limit = 1000): PlanContentsPatch | null {
  const changes: PlanContentsPatch = [];
  const walk = (left: unknown, right: unknown, path: (string | number)[]) => {
    if (Object.is(left, right) || changes.length > limit) return;
    if (!left || !right || typeof left !== "object" || typeof right !== "object" ||
      Array.isArray(left) !== Array.isArray(right) || (Array.isArray(left) && left.length !== (right as unknown[]).length)) {
      changes.push({ path, value: right }); return;
    }
    if (Array.isArray(left)) {
      for (let i = 0; i < left.length && changes.length <= limit; i++) walk(left[i], (right as unknown[])[i], [...path, i]);
      return;
    }
    for (const key of Object.keys(left)) if (!Object.hasOwn(right, key)) changes.push({ path: [...path, key], remove: true });
    for (const key of Object.keys(right)) {
      if (changes.length > limit) break;
      if (!Object.hasOwn(left, key)) changes.push({ path: [...path, key], value: Reflect.get(right, key) });
      else walk(Reflect.get(left, key), Reflect.get(right, key), [...path, key]);
    }
  };
  walk(before, after, []);
  return changes.length > limit ? null : changes;
}

/** Apply an ordered port message atomically, retaining unaffected calculation references. */
export function applyPlanContentsPatch(contents: PlanContents, changes: PlanContentsPatch): PlanContents {
  const owned = new WeakSet<object>();
  const apply = (current: unknown, change: PlanContentsPatch[number], depth: number): unknown => {
    if (depth === change.path.length) return change.value;
    const key = change.path[depth]!;
    const clone = current && typeof current === "object" && owned.has(current)
      ? current : Array.isArray(current) ? current.slice() : { ...(current as Record<string, unknown>) };
    owned.add(clone);
    if (depth === change.path.length - 1 && change.remove) Reflect.deleteProperty(clone, key);
    else Object.defineProperty(clone, key, { value: apply(Reflect.get(clone, key), change, depth + 1), enumerable: true, writable: true, configurable: true });
    return clone;
  };
  let result = contents;
  for (const change of changes) result = apply(result, change, 0) as PlanContents;
  return result;
}
