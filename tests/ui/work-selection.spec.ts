import { test, expect, openInitiativeEntry } from "./fixtures";

test("ファイルを開くと4つの入口が現れ、一次・確定を選んで一覧へ進める", async ({ page, app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const selection = app.getByRole("main", { name: "作業を選択", exact: true });
  await expect(selection).toBeVisible();
  await expect(app.getByRole("complementary", { name: "メニュー" })).toHaveCount(0);
  for (const name of ["施策を検索", "操作を取り消す", "ウィンドウを複製", "前の画面に戻る", "サイドバーを開く"]) {
    await expect(app.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(selection.getByRole("button")).toHaveCount(4);
  for (const name of ["見通し・実績", "修正予算"]) {
    await expect(selection.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(selection.getByRole("button", { name, exact: true })).toHaveAccessibleDescription("未実装");
  }
  for (const name of ["一次予算", "確定予算"]) {
    const button = selection.getByRole("button", { name, exact: true });
    await button.focus();
    await button.press("Enter");
    await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
    await expect(app.getByRole("complementary", { name: "メニュー" })).toBeVisible();
    await expect(app.getByRole("spinbutton", { name: "種別", exact: true })).toHaveAttribute("aria-valuetext", name);
    await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "作業を選択", exact: true }).click();
    await expect(selection).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(selection.locator(".work-selection-symbol").first()).toHaveCSS("transition-duration", "0s");
  const overflow = await selection.evaluate(element => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
});

test("入口に戻っても登録前の入力を保持し、別の予算へ進む前に破棄を確認する", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "一次予算", exact: true }).click();
  await openInitiativeEntry(app);
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("保持する入力");
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "作業を選択", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "確定予算", exact: true }).click();
  const dialog = app.getByRole("alertdialog", { name: "入力内容を破棄しますか？", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "確定予算", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "破棄して一覧へ戻る", exact: true }).click();
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});
