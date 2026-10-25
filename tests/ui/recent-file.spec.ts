import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { settleMotion } from "./fixtures";

const sample = await readFile(new URL("../../samples/2027年度サンプル予算.triadic", import.meta.url));

// Real structured-cloneable handles, confined to this test browser's storage.
async function filePicker(page: Page, name = "再開テスト.triadic", bytes = Array.from(sample)) {
  await page.evaluate(async ({ name, bytes }) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    await writer.write(new Uint8Array(bytes));
    await writer.close();
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: async () => [handle] });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async () => handle });
  }, { name, bytes });
}

async function closeFile(page: Page) {
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("alertdialog", { name: "閉じる", exact: true }).getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Triadic", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#recent-file-name")).toHaveText("まだ開いていません");
  await expect(page.getByRole("button", { name: "続きから", exact: true })).toBeDisabled();
});

test("旧名のファイル参照は引き継がず、新しい保存先で再開できる", async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const oldHandle = await root.getFileHandle("旧参照.triadic", { create: true });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("triadichrome-recent-file", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("files", "readwrite");
        transaction.objectStore("files").put(oldHandle, "last");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  });
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("まだ開いていません");
  await expect(page.getByRole("button", { name: "続きから", exact: true })).toBeDisabled();
  await filePicker(page);
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.locator(".home-header .home-brand")).toContainText("Triadic");
  await closeFile(page);
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("再開テスト.triadic");
  const names = await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name));
  expect(names).toContain("triadic-recent-file");
  expect(names).toContain("triadichrome-recent-file");
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
});

test("再読み込み後に記憶したファイルを開き、最新の内容を読み直す", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await filePicker(page);
  await page.getByRole("button", { name: "新規作成", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
  await closeFile(page);
  // Replace the empty plan externally, after closing it.
  await filePicker(page);
  await page.addInitScript(() => {
    let reads = 0;
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = function () { reads++; return original.call(this); };
    Object.defineProperty(window, "fileReadCount", { get: () => reads });
  });
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("再開テスト.triadic");
  expect(await page.evaluate(() => Reflect.get(window, "fileReadCount"))).toBe(0);
  await settleMotion(page.locator("body"));
  await testInfo.attach("続きから・記憶あり", { body: await page.screenshot(), contentType: "image/png" });
  expect(await page.locator("html").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
  await page.getByRole("button", { name: "マスタ", exact: true }).click();
  await page.getByRole("button", { name: /^勘定科目マスタ/ }).click();
  await expect(page.getByRole("button", { name: "売上高を編集", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("最後の1件で置き換え、記憶の消去はファイルを削除しない", async ({ page }) => {
  for (const name of ["最初.triadic", "次の計画.triadic"]) {
    await filePicker(page, name);
    await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await closeFile(page);
  }
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("次の計画.triadic");
  await page.getByRole("button", { name: "履歴を消す", exact: true }).click();
  await expect(page.locator("#recent-file-name")).toHaveText("まだ開いていません");
  await expect(page.getByRole("button", { name: "続きから", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("まだ開いていません");
  expect(await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle("次の計画.triadic")).getFile()).size;
  })).toBe(sample.length);
});

test("不正ファイルと選択キャンセルでは前回の記憶を置き換えない", async ({ page }) => {
  await filePicker(page);
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await closeFile(page);
  await filePicker(page, "不正.triadic", [1, 2, 3]);
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("読み込めません");
  await page.evaluate(() => Object.defineProperty(window, "showOpenFilePicker", {
    value: async () => { throw new DOMException("cancel", "AbortError"); },
  }));
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("再開テスト.triadic");
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
});

test("削除・破損・許可拒否の案内を出し、通常の選択で復帰できる", async ({ page }) => {
  test.setTimeout(60_000); // Several native file opens and failure recoveries run in one scenario.
  await filePicker(page);
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await closeFile(page);
  await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("再開テスト.triadic"));
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("前回のファイルが見つかりません");
  await filePicker(page, "復帰.triadic");
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await closeFile(page);
  await filePicker(page, "復帰.triadic", [1, 2, 3]);
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("読み込めません");
  await page.evaluate(() => {
    Object.defineProperty(FileSystemFileHandle.prototype, "queryPermission", { configurable: true, value: async () => "prompt" });
    Object.defineProperty(FileSystemFileHandle.prototype, "requestPermission", { configurable: true, value: async () => "denied" });
  });
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("読み書きが許可されませんでした");
  await expect(page.locator("#recent-file-name")).toHaveText("復帰.triadic");
  await page.evaluate(() => Object.defineProperty(FileSystemFileHandle.prototype, "queryPermission", { configurable: true, value: async () => "granted" }));
  await filePicker(page, "別の計画.triadic");
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("別の計画.triadic");
});

test("ドロップからも記憶し、参照のないドロップでは編集を始めず記憶を保護する", async ({ page }) => {
  await filePicker(page);
  await page.locator(".entry-page").evaluate(async element => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle("再開テスト.triadic");
    const transfer = new DataTransfer();
    transfer.items.add(await handle.getFile());
    Object.defineProperty(DataTransferItem.prototype, "getAsFileSystemHandle", { configurable: true, value: async () => handle });
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("再開テスト.triadic");
  await page.locator(".entry-page").evaluate(element => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["unavailable"], "参照なし.triadic"));
    Object.defineProperty(DataTransferItem.prototype, "getAsFileSystemHandle", { configurable: true, value: async () => null });
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole("alert")).toContainText("「ファイルを開く」から選択");
  await expect(page.getByRole("heading", { name: "Triadic", exact: true })).toBeVisible();
  await expect(page.locator("#recent-file-name")).toHaveText("再開テスト.triadic");
  await page.reload();
  await expect(page.locator("#recent-file-name")).toHaveText("再開テスト.triadic");
});

test("記憶の保存に失敗しても開けて、その画面内では再開できる", async ({ page }) => {
  await filePicker(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException("storage failure", "QuotaExceededError"); };
  });
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
  await closeFile(page);
  await expect(page.getByRole("status")).toContainText("履歴を保存できませんでした");
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("再開テスト.triadic");
});

for (const action of ["preview", "close"] as const) {
  test(`履歴の${action}で競合から別ファイルに保存すると続きからも保存成功先を開く`, async ({ page }, testInfo) => {
    await page.goto("/tests/ui/preview.html?data=defaults");
    await expect(page.locator("#status")).toHaveText("操作できます");
    const seed = await page.evaluate(async () => {
      const url = "/tests/ui/preview.ts";
      const fixture = await import(url);
      return Array.from(fixture.fixtureBytes as number[]);
    });
    await page.goto("/");
    await filePicker(page, "再開テスト.triadic", seed);
    await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await page.getByRole("button", { name: "マスタ", exact: true }).click();
    await page.getByRole("button", { name: /^勘定科目マスタ/ }).click();
    await page.getByRole("button", { name: "売上高を編集", exact: true }).click();
    await page.getByRole("textbox", { name: "売上高の名称", exact: true }).fill("保存成功先の売上");
    await expect(page.getByRole("button", { name: "完了", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "完了", exact: true }).click();
    // An external write differs from the session's saved bytes. Both files are
    // synthetic OPFS entries confined to the fresh browser context.
    await filePicker(page, "再開テスト.triadic", seed);
    await page.evaluate(async () => {
      const copy = await (await navigator.storage.getDirectory()).getFileHandle("保存成功先.triadic", { create: true });
      Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async () => copy });
    });
    if (action === "preview") {
      await page.getByRole("button", { name: "履歴", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      await page.getByRole("alertdialog", { name: "閉じる", exact: true }).getByRole("button", { name: "閉じる", exact: true }).click();
    }
    const recovery = page.getByRole("alertdialog", { name: "入力を保持しています", exact: true });
    await expect(recovery).toBeVisible();
    await recovery.getByRole("button", { name: "別のファイルに保存して続ける", exact: true }).click();
    if (action === "preview") {
      await page.locator(".history-date").last().click();
      await expect(page.getByLabel("過去のデータを閲覧中")).toBeVisible();
      await expect(page.locator(".home-file-name")).toHaveText("保存成功先.triadic");
      await page.getByRole("button", { name: "現在に戻る", exact: true }).click();
      await closeFile(page);
    }
    await expect(page.locator("#recent-file-name")).toHaveText("保存成功先.triadic");
    await testInfo.attach(`競合回復-${action}`, { body: await page.screenshot(), contentType: "image/png" });
    await page.reload();
    await expect(page.locator("#recent-file-name")).toHaveText("保存成功先.triadic");
    await page.getByRole("button", { name: "続きから", exact: true }).click();
    await page.getByRole("button", { name: "マスタ", exact: true }).click();
    await page.getByRole("button", { name: /^勘定科目マスタ/ }).click();
    await expect(page.getByRole("button", { name: "保存成功先の売上を編集", exact: true })).toBeVisible();
    expect(await page.evaluate(async () => {
      const handle = await (await navigator.storage.getDirectory()).getFileHandle("再開テスト.triadic");
      return Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
    })).toEqual(seed);
  });
}

test.describe("複数タブの再開先", () => {
  test.setTimeout(60_000);

  for (const [first, second] of [["A.triadic", "B.triadic"], ["B.triadic", "A.triadic"]] as const) {
    test(`別タブで${second}を開いた後も${first}の保存成功を再開先へ反映する`, async ({ page, context }) => {
      await filePicker(page, first);
      await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
      await expect(page.locator(".home-file-name")).toHaveText(first);
      const other = await context.newPage();
      await other.goto("/");
      await expect(other.locator("#recent-file-name")).toHaveText(first);
      await filePicker(other, second);
      await other.getByRole("button", { name: "ファイルを開く", exact: true }).click();
      await expect(other.locator(".home-file-name")).toHaveText(second);
      const probe = await context.newPage();
      await probe.goto("/");
      await expect(probe.locator("#recent-file-name")).toHaveText(second);
      await page.getByRole("button", { name: "マスタ", exact: true }).click();
      await page.getByRole("button", { name: /^勘定科目マスタ/ }).click();
      await page.getByRole("button", { name: "売上高を編集", exact: true }).click();
      await page.getByRole("textbox", { name: "売上高の名称", exact: true }).fill("最後に保存した売上");
      await page.getByRole("button", { name: "完了", exact: true }).click();
      await expect(page.getByRole("button", { name: "最後に保存した売上を編集", exact: true })).toBeVisible();
      await probe.reload();
      await expect(probe.locator("#recent-file-name")).toHaveText(first);
      await probe.getByRole("button", { name: "続きから", exact: true }).click();
      await probe.getByRole("button", { name: "マスタ", exact: true }).click();
      await probe.getByRole("button", { name: /^勘定科目マスタ/ }).click();
      await expect(probe.getByRole("button", { name: "最後に保存した売上を編集", exact: true })).toBeVisible();
    });
  }

  for (const outcome of ["変更なし", "保存失敗", "取消", "記憶失敗"] as const) {
    test(`別タブの再開先を${outcome}では置き換えず、成功した保存と入力を保持する`, async ({ page, context }) => {
      await filePicker(page, "A.triadic");
      await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
      await expect(page.locator(".home-file-name")).toHaveText("A.triadic");
      const other = await context.newPage();
      await other.goto("/");
      await filePicker(other, "B.triadic");
      await other.getByRole("button", { name: "ファイルを開く", exact: true }).click();
      await expect(other.locator(".home-file-name")).toHaveText("B.triadic");
      await page.evaluate(async outcome => {
        if (outcome === "記憶失敗") {
          IDBObjectStore.prototype.put = () => { throw new DOMException("storage failure", "QuotaExceededError"); };
        } else if (outcome === "保存失敗") {
          const handle = await (await navigator.storage.getDirectory()).getFileHandle("A.triadic");
          // A native exclusive writer also blocks the shared worker; patching this window's prototype does not.
          Reflect.set(window, "testWriter", await handle.createWritable({ mode: "exclusive" } as FileSystemCreateWritableOptions));
        } else if (outcome === "取消") {
          const path = "/Triadic-extension/src/core/storage/accountMaster.ts";
          const { readAccountMaster, changeAccountMaster } = await import(path);
          const handle = await (await navigator.storage.getDirectory()).getFileHandle("A.triadic");
          const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
          const account = (await readAccountMaster(bytes)).find((item: { accountName: string }) => item.accountName === "売上高");
          const changed = await changeAccountMaster(bytes, { ...account, type: "update", accountName: "外部から変更した売上" });
          const writer = await handle.createWritable(); await writer.write(changed.bytes); await writer.close();
        }
      }, outcome);
      await page.getByRole("button", { name: "マスタ", exact: true }).click();
      await page.getByRole("button", { name: /^勘定科目マスタ/ }).click();
      await page.getByRole("button", { name: "売上高を編集", exact: true }).click();
      const input = page.getByRole("textbox", { name: "売上高の名称", exact: true });
      if (outcome !== "変更なし") await input.fill("保持する売上");
      if (outcome === "取消") await page.getByRole("alertdialog", { name: "入力を保持しています", exact: true }).getByRole("button", { name: "キャンセル", exact: true }).click();
      if (outcome === "保存失敗" || outcome === "取消") {
        await expect(page.getByRole("alert")).toBeVisible();
        await expect(input).toHaveValue("保持する売上");
      } else {
        await page.getByRole("button", { name: "完了", exact: true }).click();
        await expect(page.getByRole("button", { name: outcome === "変更なし" ? "売上高を編集" : "保持する売上を編集", exact: true })).toBeVisible();
      }
      const probe = await context.newPage();
      await probe.goto("/");
      await expect(probe.locator("#recent-file-name")).toHaveText("B.triadic");
      if (outcome === "記憶失敗") {
        await closeFile(page);
        await expect(page.locator("#recent-file-name")).toHaveText("A.triadic");
        await expect(page.getByRole("status")).toContainText("履歴を保存できませんでした");
        await page.getByRole("button", { name: "続きから", exact: true }).click();
        await page.getByRole("button", { name: "マスタ", exact: true }).click();
        await page.getByRole("button", { name: /^勘定科目マスタ/ }).click();
        await expect(page.getByRole("button", { name: "保持する売上を編集", exact: true })).toBeVisible();
      }
    });
  }

});
