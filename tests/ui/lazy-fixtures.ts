/** Generate only requested datasets; share in-flight work and permit retry after failure. */
export function lazyFixtures<T>(factories: Record<string, () => Promise<T>>) {
  const cache = new Map<string, Promise<T>>();
  return (name: string) => {
    if (!cache.has(name)) {
      const pending = Promise.resolve().then(() => factories[name]!());
      cache.set(name, pending);
      void pending.catch(() => { if (cache.get(name) === pending) cache.delete(name); });
    }
    return cache.get(name)!;
  };
}
