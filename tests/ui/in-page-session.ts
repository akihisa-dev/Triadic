import { WindowSessionHub } from "../../Triadichrome-extension/src/extension/WindowSessionHub";

/** Only transport is replaced: existing memory handles contain methods and cannot be structured-cloned. */
export function installInPageSession() {
  const hub = new WindowSessionHub();
  const transport = () => {
    let listener: ((event: MessageEvent) => void) | null = null;
    const connection = hub.connect({ postMessage: value => queueMicrotask(() => listener?.(new MessageEvent("message", { data: value }))) });
    return { onerror: null, port: {
      get onmessage() { return listener; }, set onmessage(value) { listener = value; },
      postMessage(message: { type: string; lock?: string }) {
        if (message.type === "watch") { void navigator.locks.request(message.lock!, () => connection.disconnect()); }
        else connection.receive(message as Parameters<typeof connection.receive>[0]);
      }, start() {}, close() { connection.disconnect(); },
    } as unknown as MessagePort };
  };
  Reflect.set(window, "__triadichromePreviewTransport", transport);
  return transport;
}
