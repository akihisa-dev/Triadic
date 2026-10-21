import { test, expect, checkRuntimeErrors } from "./runtime-errors";

test("元画面・複製画面・SharedWorkerの合成エラーを成功扱いにしない", async ({ page, context, runtimeErrors }, info) => {
  const expected = ["合成console.error", "合成popup警告", "合成popup例外", "SharedWorker: Uncaught Error: 合成worker例外"];
  for (const message of expected) info.annotations.push({ type: "expected-console", description: message });
  await page.goto("/tests/ui/multi-window.html");
  const popupReady = context.waitForEvent("page");
  await page.evaluate(() => window.open("/tests/ui/multi-window.html"));
  const popup = await popupReady;
  await popup.waitForLoadState();
  await page.evaluate(() => console.error("合成console.error"));
  await popup.evaluate(() => {
    console.warn("合成popup警告");
    setTimeout(() => { throw new Error("合成popup例外"); }, 0);
    const url = URL.createObjectURL(new Blob(['throw new Error("合成worker例外")'], { type: "text/javascript" }));
    const worker = new SharedWorker(url);
    worker.port.start();
  });
  await expect.poll(() => runtimeErrors.map(error => error.message).sort()).toEqual([...expected].sort());
  expect(new Set(runtimeErrors.map(error => error.source.split(" ")[0])).size).toBe(2);
  for (const error of runtimeErrors) {
    expect(() => checkRuntimeErrors([error], [])).toThrow();
  }
  expect(() => checkRuntimeErrors([], ["未発生の期待エラー"])).toThrow();
  await popup.close();
});
