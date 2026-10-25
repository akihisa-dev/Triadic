import type { Page } from "@playwright/test";
import { test, expect } from "./runtime-errors";
import { settleMotion } from "./fixtures";

async function navigate(page: Page, name: string) {
  await page.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name, exact: true }).click();
  await settleMotion(page.locator("body"));
}
async function duplicate(page: Page) {
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "ウィンドウを複製", exact: true }).click();
  const next = await popup;
  await expect(next.locator(".home-window-label")).toBeVisible();
  await settleMotion(next.locator("body"));
  return next;
}
async function openFirst(page: Page) {
  await navigate(page, "施策一覧");
  await page.locator(".initiative-name-button").first().click();
  await expect(page.getByRole("textbox", { name: "施策名", exact: true })).toBeVisible();
  await settleMotion(page.locator("body"));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/tests/ui/multi-window.html");
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.locator(".home-window-label")).toHaveText("ウィンドウ1 · Home");
});

test("同じ表の表示条件と位置を複製し、以後は独立して操作できる", async ({ page }) => {
  await navigate(page, "総原価表");
  const region = page.getByRole("region", { name: "総原価表の月別前年・種別別金額", exact: true });
  await region.evaluate(element => { element.scrollTop = 190; element.scrollLeft = 360; });
  const offsets = await region.evaluate(element => [element.scrollTop, element.scrollLeft]);
  const copy = await duplicate(page);
  await expect(copy.getByRole("heading", { name: "総原価表", exact: true })).toBeVisible();
  await expect.poll(() => copy.getByRole("region", { name: "総原価表の月別前年・種別別金額", exact: true }).evaluate(element => [element.scrollTop, element.scrollLeft])).toEqual(offsets);
  await expect(copy).toHaveTitle(/^ウィンドウ2 · 総原価表/);
  await copy.getByRole("combobox", { name: "部署名", exact: true }).selectOption({ index: 1 });
  await expect(page.getByRole("combobox", { name: "部署名", exact: true })).toHaveValue("");
  await navigate(copy, "展開表");
  await expect(page.getByRole("heading", { name: "総原価表", exact: true })).toBeVisible();
  await expect(copy.getByRole("heading", { name: "展開表", exact: true })).toBeVisible();
});

test('開いている別計画への別名保存は両ファイルを変更する前に拒否する', async ({ page, context }, info) => {
  const other = await context.newPage();
  await other.goto('/tests/ui/multi-window.html?name=別計画.triadic');
  await other.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await openFirst(other);
  await other.getByRole('textbox', { name: '施策名', exact: true }).fill('保存先で保持する施策名');
  await expect(other.getByRole('button', { name: '操作を取り消す', exact: true })).toBeEnabled();
  const hashes = () => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return Promise.all(['ウィンドウ確認.triadic', '別計画.triadic'].map(async name => {
      const bytes = await (await (await root.getFileHandle(name)).getFile()).arrayBuffer();
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].join(',');
    }));
  });
  const before = await hashes();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle('別計画.triadic');
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle });
  });
  await page.getByRole('button', { name: '別名で保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('別のウィンドウで使用している保存先');
  expect(await hashes()).toEqual(before);
  await expect(page.locator('.home-file-name')).toHaveText('ウィンドウ確認.triadic');
  await expect(other.getByRole('textbox', { name: '施策名', exact: true })).toHaveValue('保存先で保持する施策名');
  await page.screenshot({ path: info.outputPath('occupied-save-destination.png') });
});

test("施策の保存を三画面へ反映し、元のウィンドウを閉じても共有取消を続けられる", async ({ page }) => {
  await openFirst(page);
  await page.getByRole("tab", { name: "一次予算", exact: true }).click();
  const originalName = await page.getByRole("textbox", { name: "施策名", exact: true }).inputValue();
  const cost = await duplicate(page); await navigate(cost, "総原価表");
  const expansion = await duplicate(cost); await navigate(expansion, "展開表");
  const beforeCost = await cost.getByRole("table", { name: "総原価表", exact: true }).textContent();
  const beforeExpansion = await expansion.getByRole("table", { name: "展開表", exact: true }).textContent();
  await page.bringToFront();
  const amount = page.getByRole("spinbutton").first();
  const oldAmount = await amount.inputValue();
  await amount.fill(String(Number(oldAmount) + 317));
  await expect.poll(() => cost.getByRole("table", { name: "総原価表", exact: true }).textContent()).not.toBe(beforeCost);
  await expect.poll(() => expansion.getByRole("table", { name: "展開表", exact: true }).textContent()).not.toBe(beforeExpansion);
  await page.getByRole("textbox", { name: "施策名", exact: true }).fill("ウィンドウ間の反映確認");
  await expect(expansion.getByRole("button", { name: "ウィンドウ間の反映確認", exact: true })).toBeVisible();
  await page.close();
  await cost.bringToFront();
  await cost.getByRole("button", { name: "操作を取り消す", exact: true }).click();
  await expect(expansion.getByRole("button", { name: originalName, exact: true })).toBeVisible();
  await cost.getByRole("button", { name: "操作をやり直す", exact: true }).click();
  await expect(expansion.getByRole("button", { name: "ウィンドウ間の反映確認", exact: true })).toBeVisible();
});

test("同じ施策でウィンドウを切り替え、直前の入力を失わずそのまま編集できる", async ({ page }) => {
  await openFirst(page);
  const copy = await duplicate(page);
  await page.bringToFront();
  await page.getByRole("textbox", { name: "備考", exact: true }).fill("切替直前の備考");
  await copy.bringToFront();
  await copy.getByRole("textbox", { name: "施策名", exact: true }).fill("切替直後の施策名");
  await expect(page.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue("切替直後の施策名");
  await expect(copy.getByRole("textbox", { name: "備考", exact: true })).toHaveValue("切替直前の備考");
  await page.bringToFront();
  await expect(page.getByRole("textbox", { name: "備考", exact: true })).toHaveValue("切替直前の備考");
});

test("保存待ちを吸収して履歴へ集約し、未登録入力の破棄だけを確認する", async ({ page }) => {
  await openFirst(page);
  const copy = await duplicate(page);
  await page.bringToFront();
  await page.getByRole("textbox", { name: "備考", exact: true }).fill("履歴直前の自動保存");
  await navigate(page, "履歴");
  await expect.poll(() => copy.isClosed()).toBe(true);
  await expect(page.getByRole("heading", { name: "履歴", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ウィンドウを複製", exact: true })).toBeDisabled();
  await navigate(page, "施策一覧");
  await expect(page.getByRole("button", { name: "ウィンドウを複製", exact: true })).toBeEnabled();
  const draft = await duplicate(page);
  await draft.getByRole("button", { name: "施策を追加", exact: true }).click();
  await draft.getByRole("textbox", { name: "施策名", exact: true }).fill("未登録の入力を保持");
  await navigate(page, "履歴");
  const confirmation = page.getByRole("alertdialog", { name: "履歴を開きますか？", exact: true });
  await expect(confirmation).toContainText("ウィンドウ3");
  await confirmation.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(draft.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue("未登録の入力を保持");
  await page.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "履歴", exact: true }).click();
  await confirmation.getByRole("button", { name: "はい", exact: true }).click();
  await expect.poll(() => draft.isClosed()).toBe(true);
  await expect(page.getByRole("heading", { name: "履歴", exact: true })).toBeVisible();
});

test("別名保存で全画面の保存先を切り替え、閉じるはその画面だけ入口へ戻す", async ({ page }) => {
  await openFirst(page);
  const copy = await duplicate(page);
  await copy.getByRole("textbox", { name: "備考", exact: true }).fill("別名保存直前の編集");
  await page.getByRole("button", { name: "別名で保存", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("ウィンドウ確認 のコピー.triadic");
  await expect(copy.locator(".home-file-name")).toHaveText("ウィンドウ確認 のコピー.triadic");
  await expect(page.getByRole("textbox", { name: "備考", exact: true })).toHaveValue("別名保存直前の編集");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("alertdialog", { name: "閉じる", exact: true }).getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Triadic", exact: true })).toBeVisible();
  await copy.getByRole("textbox", { name: "施策名", exact: true }).fill("残った画面で編集");
  await navigate(copy, "施策一覧");
  await expect(copy.getByRole("button", { name: "残った画面で編集", exact: true })).toBeVisible();
});


test("別画面の集計の未登録入力を別名保存と履歴集約で保護する", async ({ page }) => {
  const copy = await duplicate(page);
  await navigate(copy, "マスタ");
  await copy.getByRole("button", { name: /^集計マスタ/ }).click();
  await copy.getByRole("button", { name: "＋ 集計を追加", exact: true }).click();
  const input = copy.getByRole("textbox", { name: "集計名", exact: true });
  await input.fill("まだ登録しない集計");
  await page.bringToFront();
  await page.getByRole("button", { name: "別名で保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("ウィンドウ2 · 集計マスタ");
  await expect(input).toHaveValue("まだ登録しない集計");
  await navigate(page, "履歴");
  const confirmation = page.getByRole("alertdialog", { name: "履歴を開きますか？", exact: true });
  await expect(confirmation).toContainText("ウィンドウ2 · 集計マスタ");
  await confirmation.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(input).toHaveValue("まだ登録しない集計");
  await navigate(page, "履歴");
  await confirmation.getByRole("button", { name: "はい", exact: true }).click();
  await expect.poll(() => copy.isClosed()).toBe(true);
  await expect(page.getByRole("heading", { name: "履歴", exact: true })).toBeVisible();
});





test("応答のない別画面を30秒で案内し、施策の入力を保持して履歴操作を再試行できる", async ({ page, context }, info) => {
  test.setTimeout(60_000);
  // Keep the actual shared worker and withhold only a synthetic peer's flush reply.
  await context.addInitScript(() => {
    const Original = SharedWorker;
    window.SharedWorker = new Proxy(Original, { construct(target, args) {
      const worker = Reflect.construct(target, args) as SharedWorker;
      const held = new Set<number>(), send = worker.port.postMessage.bind(worker.port);
      worker.port.addEventListener("message", event => {
        const message = event.data as { type: string; action: string; id: number };
        if (Reflect.get(window, "holdWindowFlush") && message.type === "control" && message.action === "flush") held.add(message.id);
      });
      worker.port.postMessage = ((...args: Parameters<MessagePort["postMessage"]>) => {
        const message = args[0] as { type: string; id: number };
        if (message.type === "reply" && held.has(message.id)) return;
        Reflect.apply(send, worker.port, args);
      }) as MessagePort["postMessage"];
      return worker;
    } });
  });
  const copy = await duplicate(page);
  await openFirst(copy);
  const note = copy.getByRole("textbox", { name: "備考", exact: true });
  await note.fill("中止後も残る備考");
  await copy.evaluate(() => { Reflect.set(window, "holdWindowFlush", true); });
  await navigate(page, "履歴");
  const notice = page.getByRole("alert");
  await expect(notice).toContainText("ウィンドウ2 · 施策詳細から30秒以内に応答", { timeout: 40_000 });
  await expect(notice).toContainText("入力は保持しています");
  expect(copy.isClosed()).toBe(false);
  await expect(note).toHaveValue("中止後も残る備考");
  await page.screenshot({ path: info.outputPath("window-timeout.png") });
  await copy.evaluate(() => { Reflect.set(window, "holdWindowFlush", false); });
  await navigate(page, "履歴");
  await expect.poll(() => copy.isClosed()).toBe(true);
  await expect(page.getByRole("heading", { name: "履歴", exact: true })).toBeVisible();
  await openFirst(page);
  await expect(page.getByRole("textbox", { name: "備考", exact: true })).toHaveValue("中止後も残る備考");
});
