import { test, expect, settleMotion, selectClassification } from "./fixtures";
import type { Page, FrameLocator } from "@playwright/test";

async function openFull(page: Page, app: FrameLocator) {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  return app.getByRole("navigation", { name: "メインナビゲーション" });
}

test("マスタの直下の日時履歴から全画面を閲覧でき、編集・削除・並べ替えは禁止", async ({ page, app }) => {
  const menu = await openFull(page, app);
  const names = await menu.getByRole("button").allTextContents();
  expect(names.indexOf("履歴")).toBe(names.indexOf("マスタ") + 1);
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(3);
  await app.locator(".history-date").last().click();
  await expect(app.getByLabel("過去のデータを閲覧中")).toContainText("閲覧専用");
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await expect(app.getByRole("textbox", { name: "施策名", exact: true })).toBeDisabled();
  await expect(app.getByRole("textbox", { name: "備考", exact: true })).toHaveValue("履歴確認用の過去の状態");
  const firstAmount = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(firstAmount).toHaveValue("100");
  await expect(firstAmount).toBeDisabled();
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(firstAmount).toHaveValue("130");
  await expect(app.getByRole("tab", { name: "確定予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await app.getByRole("button", { name: "現在に戻る", exact: true }).click();
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").nth(1).click();
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(firstAmount).toHaveValue("110");
  await expect(firstAmount).toBeDisabled();
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(firstAmount).toHaveValue("130");
  await expect(app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "前年入力", exact: true }).click();
  await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
  await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
  await expect(app.locator(".previous-grid input")).toHaveCount(0);
  for (const title of ["総原価表", "展開表"]) {
    await menu.getByRole("button", { name: title, exact: true }).click();
    await expect(app.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  for (const title of ["勘定科目マスタ", "展開マスタ", "業種マスタ", "部署マスタ", "期間マスタ", "種別マスタ"]) {
    await menu.getByRole("button", { name: "マスタ", exact: true }).click();
    await app.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    await expect(app.getByRole("heading", { name: title, exact: true })).toBeVisible();
    for (const button of await app.getByRole("button", { name: /を編集$|を削除$|^登録$|^＋ 集計を追加$/ }).all()) await expect(button).toBeDisabled();
    await expect(app.getByRole("button", { name: "← マスタへ戻る", exact: true })).toBeEnabled();
  }
  await settleMotion(app.locator("body"));
  await app.getByRole("button", { name: "現在に戻る", exact: true }).click();
  await expect(app.locator(".history-date"), "閲覧で履歴を増やさない").toHaveCount(3);
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(firstAmount).toHaveValue("120");
  await expect(firstAmount).toBeEnabled();
});

test("復元確認の取消、復元成功、復元前へ戻す操作と再読込", async ({ page, app }) => {
  const menu = await openFull(page, app);
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await app.getByLabel("過去のデータを閲覧中").getByRole("button", { name: "この時点に戻す", exact: true }).click();
  let dialog = app.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(app.getByLabel("過去のデータを閲覧中")).toBeVisible();
  await app.getByLabel("過去のデータを閲覧中").getByRole("button", { name: "この時点に戻す", exact: true }).click();
  await dialog.getByRole("button", { name: "この時点に戻す", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(5);
  await app.locator(".history-date").nth(1).click();
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("120");
  await app.getByLabel("過去のデータを閲覧中").getByRole("button", { name: "この時点に戻す", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "この時点に戻す", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(7);
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "履歴", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(7);
});

test("複数選択・指定日時より前の削除は確認後だけ行い、現在は維持", async ({ page, app }) => {
  const menu = await openFull(page, app);
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  const checks = app.getByRole("region", { name: "データの履歴", exact: true }).getByRole("checkbox");
  await app.getByRole("checkbox", { name: "すべての履歴を選択", exact: true }).check();
  for (const check of await checks.all()) await expect(check).toBeChecked();
  await checks.nth(3).uncheck();
  await expect(checks.first()).not.toBeChecked();
  await app.getByLabel("指定日時より前を削除", { exact: true }).fill("2099-01-01T00:00");
  await expect(checks.nth(1)).toBeChecked(); await expect(checks.nth(2)).toBeChecked();
  await app.getByRole("button", { name: "選択した履歴を削除", exact: true }).click();
  await expect(app.getByRole("alertdialog")).toContainText("2件");
  await app.getByRole("alertdialog").getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(app.getByRole("alertdialog")).not.toBeVisible();
  await expect(app.locator(".history-date")).toHaveCount(3);
  await expect(checks.nth(1)).toBeChecked(); await expect(checks.nth(2)).toBeChecked();
  await app.getByRole("button", { name: "選択した履歴を削除", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "削除する", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(1);
  await app.getByLabel("指定日時より前を削除", { exact: true }).fill("2099-01-01T00:00");
  await app.getByRole("button", { name: "一括削除", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "削除する", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(0);
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("120");
});

test("履歴の全選択削除が失敗しても選択と履歴を保ち、確認を取消できる", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await page.getByLabel("ファイル操作", { exact: true }).selectOption("save-failure");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "履歴", exact: true }).click();
  const all = app.getByRole("checkbox", { name: "すべての履歴を選択", exact: true });
  await all.check(); await all.uncheck();
  await expect(app.getByRole("button", { name: "選択した履歴を削除", exact: true })).toBeDisabled();
  await all.check();
  await app.getByRole("button", { name: "選択した履歴を削除", exact: true }).click();
  const dialog = app.getByRole("alertdialog");
  await expect(dialog).toContainText("3件");
  await dialog.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(dialog).toContainText("保存失敗");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(3);
  for (const check of await app.getByRole("region", { name: "データの履歴", exact: true }).getByRole("checkbox").all()) await expect(check).toBeChecked();
});

test("復元の保存失敗では閲覧中の状態と現在のデータを保持", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await page.getByLabel("ファイル操作", { exact: true }).selectOption("save-failure");
  await settleMotion(app.locator("body"));
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await app.getByLabel("過去のデータを閲覧中").getByRole("button", { name: "この時点に戻す", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "この時点に戻す", exact: true }).click();
  await expect(app.getByRole("alertdialog")).toContainText("保存失敗");
  await app.getByRole("alertdialog").getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(app.getByLabel("過去のデータを閲覧中")).toBeVisible();
  await app.getByRole("button", { name: "現在に戻る", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(3);
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("120");
});

test("5分期限は追加保存で延びず、閉じる際も未記録分を残す", async ({ page, app }) => {
  const menu = await openFull(page, app);
  await page.clock.install();
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
  await expect(app.getByRole("spinbutton", { name: "比較対象2", exact: true })).toBeEnabled();
  await page.clock.runFor(120_000);
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "未選択");
  await expect(app.getByRole("spinbutton", { name: "比較対象2", exact: true })).toBeEnabled();
  await page.clock.runFor(179_000);
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await page.clock.runFor(1_000);
  await expect(app.locator(".history-date")).toHaveCount(4);
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
  await expect(app.getByRole("spinbutton", { name: "比較対象2", exact: true })).toBeEnabled();
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(5);
});

test("閲覧前に未記録分を保存し、終了時の記録失敗では閉じず再試行できる", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.locator("body").evaluate(() => {
    const target = window as unknown as Window & { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    const pick = target.showOpenFilePicker;
    Object.defineProperty(target, "showOpenFilePicker", { configurable: true, value: async () => {
      const handles = await pick();
      const handle = handles[0]!;
      const create = handle.createWritable.bind(handle);
      let writes = 0;
      handle.createWritable = async (...args) => {
        if (++writes === 4) throw new Error("テスト用の終了記録失敗です。");
        return create(...args);
      };
      return handles;
    } });
  });
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
  await expect(app.getByRole("spinbutton", { name: "比較対象2", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await app.getByRole("button", { name: "現在に戻る", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(4);
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "未選択");
  await expect(app.getByRole("spinbutton", { name: "比較対象2", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(app.getByRole("alertdialog")).toContainText("終了記録失敗");
  await expect(app.locator(".history-date")).toHaveCount(4);
  await app.getByRole("alertdialog").getByRole("button", { name: "保存を再試行して閉じる", exact: true }).click();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(5);
});


test("自動記録エラーは閉じる操作を出さず、通常通知を閉じても保持して再試行で解消", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.locator("body").evaluate(() => {
    const target = window as unknown as Window & { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    const pick = target.showOpenFilePicker;
    target.showOpenFilePicker = async () => {
      const handles = await pick();
      const handle = handles[0]!;
      const create = handle.createWritable.bind(handle);
      let writes = 0;
      handle.createWritable = async (...args) => {
        if (++writes === 2) throw new Error("テスト用の自動記録失敗です。");
        if (writes === 3) throw new Error("テスト用の通常保存失敗です。");
        return create(...args);
      };
      return handles;
    };
  });
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await page.clock.install();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  const comparison = app.getByRole("spinbutton", { name: "比較対象2", exact: true });
  await selectClassification(comparison, "確定予算");
  await expect(comparison).toBeEnabled();
  await page.clock.runFor(301_000);
  const notice = app.locator(".status-notice");
  await expect(notice).toContainText("自動記録失敗");
  await expect(notice.getByRole("button", { name: "通知を閉じる", exact: true })).toHaveCount(0);
  await comparison.press("Home");
  await expect(notice).toContainText("通常保存失敗");
  await notice.getByRole("button", { name: "通知を閉じる", exact: true }).click();
  await expect(notice).toContainText("自動記録失敗");
  await expect(notice.getByRole("button", { name: "通知を閉じる", exact: true })).toHaveCount(0);
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(3);
  await app.getByRole("button", { name: "保存を再試行", exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expect(app.locator(".history-date")).toHaveCount(4);
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("120");
});
