/** Clone wire data. Node file-handle doubles keep their identity, like native handles to one file. */
export function cloneWindowMessage(message) {
  const handles = [];
  const marker = `file-handle:${crypto.randomUUID()}`;
  const prepare = value => {
    if (!value || typeof value !== "object") return value;
    if (typeof value.getFile === "function") {
      handles.push(value); return { [marker]: handles.length - 1 };
    }
    if (Array.isArray(value)) return value.map(prepare);
    if (Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, prepare(item)]));
    return value;
  };
  const restore = value => {
    if (!value || typeof value !== "object") return value;
    if (Object.hasOwn(value, marker)) return handles[value[marker]];
    if (Array.isArray(value)) return value.map(restore);
    if (Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]));
    return value;
  };
  return restore(structuredClone(prepare(message)));
}

/** Real client and hub; only browser startup/lifetime is bypassed at this single test seam.
 * Hooks return "hold", "drop" or "disconnect". All ordinary deliveries are asynchronous.
 * Browser initialization and hub-only unit tests deliberately keep separate coverage.
 */
export function connectWindowSession(api, hub, { controls = {}, toClient, toHub } = {}) {
  const session = new api.WindowPlanSession(), sent = [], received = [], held = [];
  session.started = Promise.resolve();
  const connection = hub.connect({ postMessage: message => send("client", message) });
  session.port = { postMessage: message => send("hub", message) };
  const unregister = session.registerControls({ draft: () => false, discard() {}, close() {}, confirmDiscard: async () => true, ...controls });
  const deliver = (direction, message) => direction === "client" ? session.receive(message) : connection.receive(message);
  function send(direction, message) {
    const copied = cloneWindowMessage(message);
    (direction === "client" ? received : sent).push(cloneWindowMessage(copied));
    const decision = (direction === "client" ? toClient : toHub)?.(copied);
    if (decision === "hold") { held.push({ direction, message: copied }); return; }
    if (decision === "drop") return;
    if (decision === "disconnect") { connection.disconnect(); return; }
    queueMicrotask(() => { void deliver(direction, copied); });
  }
  return {
    session, sent, received,
    async releaseHeld() { for (const { direction, message } of held.splice(0)) await deliver(direction, message); },
    async deliverToClient(message) { await Promise.resolve(); await deliver("client", cloneWindowMessage(message)); },
    disconnect() { connection.disconnect(); },
    dispose() { held.length = 0; unregister(); connection.disconnect(); },
  };
}
