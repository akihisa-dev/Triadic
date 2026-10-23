import type { AutoSave } from "../core/autoSave";

type Controller = Pick<AutoSave<unknown>, "flushResult" | "getSnapshot" | "subscribe" | "isComposing">;
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
      while (controller.getSnapshot().pending || controller.getSnapshot().saving) {
        if (controller.isComposing()) throw new Error("日本語の変換を確定してください。入力は保持しています。");
        const error = await controller.flushResult();
        if (error) throw new Error(error);
      }
    }
  } while ([...controllers].some(controller => controller.getSnapshot().pending));
}
