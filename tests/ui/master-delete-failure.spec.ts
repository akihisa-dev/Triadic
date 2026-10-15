import { test, expect } from "@playwright/test";
import { test as appTest, openInitiativeEntry, selectClassification } from "./fixtures";

for (const [subject, name] of [["部署", "部署A"], ["業種", "直営自動車"], ["期間", "新規"]] as const) {
  appTest(`${subject}の削除拒否後も保持中の施策入力へ戻れる`, async ({ app }) => {
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
    await openInitiativeEntry(app);
    await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
    await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
    await selectClassification(app.getByRole("combobox", { name: "期間名", exact: true }), "新規");
    await app.getByRole("textbox", { name: "施策名", exact: true }).fill("削除拒否後も保持する入力");
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "マスタ", exact: true }).click();
    await app.getByRole("button", { name: new RegExp(`^${subject}マスタ`) }).click();
    const remove = app.getByRole("button", { name: `${name}を削除`, exact: true });
    await remove.click();
    const dialog = app.getByRole("alertdialog", { name: `${subject}を削除`, exact: true });
    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(app.getByRole("alert")).toContainText(`施策入力で選択している${subject}は削除できません。`);
    await expect(remove).toBeFocused();
    const back = app.getByRole("button", { name: "前の画面に戻る", exact: true });
    await back.click(); await back.click();
    await expect(app.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue("削除拒否後も保持する入力");
    await expect(app.getByRole("combobox", { name: `${subject}名`, exact: true }).locator("option:checked")).toHaveText(name);
  });
}

test("共通マスタの削除失敗・取消は確認を閉じて理由を伝え、再試行できる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/ui/named-master-rebase.html");
  const remove = page.getByRole("button", { name: "同期確認を削除", exact: true });
  const dialog = page.getByRole("alertdialog", { name: "展開を削除", exact: true });
  for (const [result, reason] of [
    ["拒否", "施策入力で選択している展開は削除できません。"],
    ["保存失敗", "保存できませんでした。"],
    ["取消", "保存をキャンセルしました。入力内容は残っています。"],
  ] as const) {
    await page.getByLabel("削除結果").selectOption(result);
    await remove.click();
    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".status-notice").getByRole(result === "取消" ? "status" : "alert")).toHaveText(reason);
    await expect(remove).toBeFocused();
    await expect(page.getByLabel("保存結果")).toContainText("同期確認");
    await page.getByRole("button", { name: "通知を閉じる", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".status-notice")).toHaveCount(0);
  }
  for (const cancel of ["Escape", "キャンセル"]) {
    await remove.click();
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(remove).toBeFocused();
  }
  await page.getByLabel("削除結果").selectOption("成功");
  await remove.click();
  await dialog.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(remove).toHaveCount(0);
  await expect(page.getByLabel("保存結果")).toHaveText("[]");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
