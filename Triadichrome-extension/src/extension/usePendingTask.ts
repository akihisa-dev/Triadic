import { useLayoutEffect, useState } from "react";
import { registerAutoSave } from "./flushAutoSaves";

/** Local file reads must finish before navigation flushes the newly changed editor. */
export function usePendingTask() {
  const [task] = useState(() => {
    let pending: Promise<void> | null = null;
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach(listener => listener());
    return {
      getSnapshot: () => ({ draft: null, pending: pending !== null, saving: false, error: "" }),
      isComposing: () => false,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      flush: async () => { await pending; },
      run: (operation: () => Promise<void>) => {
        const current = Promise.resolve().then(operation).finally(() => {
          if (pending === current) { pending = null; notify(); }
        });
        pending = current; notify();
        return current;
      },
    };
  });
  useLayoutEffect(() => registerAutoSave(task), [task]);
  return task;
}
