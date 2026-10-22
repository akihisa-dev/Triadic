import type { AutoSave } from "../core/autoSave";

type Controller = Pick<AutoSave<unknown>, "flush" | "getSnapshot" | "subscribe" | "isComposing">;
const controllers = new Set<Controller>();
const listeners = new Set<() => void>();
export const subscribeAutoSaveFailures = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const hasAutoSaveFailure = () => [...controllers].some(controller => Boolean(controller.getSnapshot().error));
export function registerAutoSave(controller: Controller) {
  controllers.add(controller);
  const notify = () => listeners.forEach(listener => listener());
  const unsubscribe = controller.subscribe(notify);
  notify();
  return () => { unsubscribe(); controllers.delete(controller); notify(); };
}
export async function flushAutoSaves() {
  do {
    for (const controller of controllers) {
      // An older save may still be publishing and scheduling the latest input.
      while (controller.getSnapshot().saving) await new Promise<void>(resolve => {
        const unsubscribe = controller.subscribe(() => {
          if (!controller.getSnapshot().saving) { unsubscribe(); resolve(); }
        });
        if (!controller.getSnapshot().saving) { unsubscribe(); resolve(); }
      });
      while (controller.getSnapshot().pending) {
        if (controller.isComposing()) throw new Error("日本語の変換を確定してください。入力は保持しています。");
        await controller.flush();
        const state = controller.getSnapshot();
        if (state.error) throw new Error(state.error);
      }
    }
  } while ([...controllers].some(controller => controller.getSnapshot().pending));
}
