/** Serialize preparation side effects and commit only the latest requested target. */
export function latestNavigation<T>(prepare: (target: T) => Promise<void>, onError: (error: unknown) => void) {
  let pending: { target: T; perform: () => void } | null = null;
  let running = false;
  const drain = async () => {
    running = true;
    while (pending) {
      const request = pending; pending = null;
      try { await prepare(request.target); if (!pending) request.perform(); }
      catch (error) { onError(error); }
    }
    running = false;
  };
  return (target: T, perform: () => void) => {
    pending = { target, perform };
    if (!running) void drain();
  };
}
