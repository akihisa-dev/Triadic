import { test, expect } from "./fixtures";

test("新規作成は選択後に更新された保存先を保護し、別の保存先で作成をやり直せる", async ({ app }) => {
  await app.locator("body").evaluate(() => {
    let picks = 0, reads = 0;
    let stored = new Uint8Array([1, 2, 3]);
    let separateStored = new Uint8Array();
    const target = window as unknown as Window & { showSaveFilePicker: () => Promise<FileSystemFileHandle>; creationResult: { writes: number; readsAtInitialization: number | null; stored: () => number[] } };
    target.creationResult = { writes: 0, readsAtInitialization: null, stored: () => Array.from(stored) };
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: { task?: string }, options?: StructuredSerializeOptions | Transferable[]) {
      if (picks === 1 && message.task === "createTriadicDatabase") {
        target.creationResult.readsAtInitialization = reads;
        stored = new Uint8Array([4, 5, 6]);
      }
      return send.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
    target.showSaveFilePicker = async () => {
      picks++;
      const separate = picks > 1;
      const name = separate ? "別の保存先.triadic" : "Untitled.triadic";
      return {
        name,
        queryPermission: async () => "granted",
        getFile: async () => {
          reads++;
          return new File([separate ? separateStored : stored], name);
        },
        createWritable: async () => {
          let pending: Uint8Array<ArrayBuffer>;
          return {
            write: async (data: ArrayBuffer) => { target.creationResult.writes++; pending = new Uint8Array(data); },
            close: async () => { if (separate) separateStored = pending; else stored = pending; },
            abort: async () => {},
          };
        },
      } as unknown as FileSystemFileHandle;
    };
  });
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("保存先のファイルが更新されたため");
  await expect(app.getByRole("button", { name: "新規作成", exact: true })).toBeEnabled();
  expect(await app.locator("body").evaluate(() => {
    const result = (window as unknown as { creationResult: { writes: number; readsAtInitialization: number | null; stored: () => number[] } }).creationResult;
    return { writes: result.writes, readsAtInitialization: result.readsAtInitialization, bytes: result.stored() };
  })).toEqual({ writes: 0, readsAtInitialization: 1, bytes: [4, 5, 6] });
  await app.getByRole("button", { name: "通知を閉じる", exact: true }).click();
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(app.getByRole("alert")).toHaveCount(0);
  await expect(app.locator(".home-file-name")).toHaveText("別の保存先.triadic");
  expect(await app.locator("body").evaluate(() => (window as unknown as { creationResult: { stored: () => number[] } }).creationResult.stored())).toEqual([4, 5, 6]);
});
