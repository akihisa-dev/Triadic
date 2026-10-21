import { test as base, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

export type RuntimeError = { source: string; message: string };
export function checkRuntimeErrors(errors: RuntimeError[], expected: string[]) {
  for (const message of expected) expect(errors.map(error => error.message)).toContain(message);
  expect(errors.filter(error => !expected.includes(error.message)), "全ウィンドウの実行時エラー・警告").toEqual([]);
}

export async function collectRuntimeErrors(context: BrowserContext) {
  const errors: RuntimeError[] = [];
  const listeners: (() => void)[] = [];
  let sequence = 0;
  const watch = (page: Page) => {
    const source = `画面${++sequence}`;
    const pageError = (error: Error) => errors.push({ source: `${source} ${page.url()}`, message: error.message });
    const consoleMessage = (message: import("@playwright/test").ConsoleMessage) => {
      if (["error", "warning"].includes(message.type())) errors.push({ source: `${source} ${page.url()}`, message: message.text() });
    };
    page.on("pageerror", pageError); page.on("console", consoleMessage);
    listeners.push(() => { page.off("pageerror", pageError); page.off("console", consoleMessage); });
  };
  context.on("page", watch);
  context.pages().forEach(watch);
  // Playwright does not expose SharedWorker objects. Forward their browser error
  // events through the owning page; no worker messages or code are replaced.
  await context.addInitScript(() => {
    if (typeof SharedWorker === "undefined") return;
    const Original = SharedWorker;
    globalThis.SharedWorker = new Proxy(Original, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as SharedWorker;
        worker.addEventListener("error", event => console.error(`SharedWorker: ${(event as ErrorEvent).message || "実行時エラー"}`));
        return worker;
      },
    });
  });
  return { errors, dispose: () => { context.off("page", watch); listeners.forEach(remove => remove()); } };
}

export const test = base.extend<{ runtimeErrors: RuntimeError[] }>({
  runtimeErrors: [async ({ context }, use, info: TestInfo) => {
    const collector = await collectRuntimeErrors(context);
    try { await use(collector.errors); }
    finally {
      collector.dispose();
      checkRuntimeErrors(collector.errors, info.annotations.filter(item => item.type === "expected-console").map(item => item.description ?? ""));
    }
  }, { auto: true }],
});
export { expect };
