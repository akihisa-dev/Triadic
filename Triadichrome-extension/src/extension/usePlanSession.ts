import { useState, useSyncExternalStore } from "react";
import { WindowPlanSession } from "./WindowPlanSession";
export function usePlanSession() {
  const [session] = useState(() => {
    // The preview supplies an in-memory file boundary, while exercising the same client and coordinator.
    let transport: (() => Pick<SharedWorker, "port" | "onerror">) | undefined;
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("local-session")) {
      const key = "__triadichromePreviewTransport";
      const source = window.opener ?? window.parent;
      transport = Reflect.get(source, key);
      if (transport) Reflect.set(window, key, transport);
    }
    return new WindowPlanSession(transport);
  });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { session, snapshot, windows: session };
}
