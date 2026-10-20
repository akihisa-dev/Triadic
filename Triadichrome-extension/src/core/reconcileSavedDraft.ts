const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Apply only edits made since submission over the values actually committed to the file. */
export function reconcileSavedDraft<T>(submitted: T, pending: T, persisted: T): T {
  const merge = (base: unknown, local: unknown, saved: unknown): unknown => {
    if (equal(base, local)) return saved;
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(saved)) {
      // Checkbox memberships are unique numeric IDs: preserve incoming additions/removals
      // while applying only the memberships changed after submission.
      if ([base, local, saved].every(items => items.every(Number.isSafeInteger) && new Set(items).size === items.length)) {
        const removed = new Set(base.filter(id => !local.includes(id)));
        return [...new Set([...saved.filter(id => !removed.has(id)), ...local.filter(id => !base.includes(id))])];
      }
      const key = (item: unknown) => record(item) && (item.id !== undefined ? `${item.kind ?? "id"}:${item.id}` : item.accountId !== undefined ? `account:${item.accountId}` : undefined);
      const maps = [base, local, saved].map(items => new Map(items.map(item => [key(item), item])));
      if (maps.some((map, index) => map.has(undefined) || map.size !== [base, local, saved][index]!.length)) return local;
      const [original, edited, committed] = maps;
      const localOrder = [...edited!.keys()], baseOrder = [...original!.keys()], savedOrder = [...committed!.keys()];
      const order = [...new Set([...(equal(baseOrder, localOrder) ? savedOrder : localOrder), ...savedOrder, ...localOrder])];
      return order.map(id => merge(original!.get(id), edited!.get(id), committed!.get(id))).filter(value => value !== undefined);
    }
    if (record(base) && record(local) && record(saved)) {
      return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(saved)])]
        .map(key => [key, merge(base[key], local[key], saved[key])]).filter(([, value]) => value !== undefined));
    }
    return local;
  };
  return merge(submitted, pending, persisted) as T;
}
