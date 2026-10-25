import { test, expect } from "@playwright/test";

for (const mode of ["確認内", "取消後"]) test(`履歴削除の許可失効を${mode}から回復できる`, async ({ page }) => {
  await page.goto("/tests/ui/history-permission.html");
  const entries = page.locator(".history-date");
  await expect(entries).toHaveCount(3);
  await page.getByRole("button", { name: "書込許可を失効" }).click();
  const checks = page.getByRole("region", { name: "データの履歴" }).getByRole("checkbox");
  await checks.nth(1).check();
  await page.getByRole("button", { name: "選択した履歴を削除" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(dialog).toContainText("保存を再試行");
  await expect(dialog).toContainText("1件の履歴を削除しますか");
  await expect(page.getByLabel("許可要求回数")).toHaveText("0");
  if (mode === "確認内") {
    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(dialog).toContainText("ファイルへの保存を許可");
    await expect(entries).toHaveCount(3);
    await expect(page.getByLabel("許可要求回数")).toHaveText("1");
    // The approval switch is a fixture control outside the modal, so cancel before setting it.
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await page.getByRole("button", { name: "次の許可を承認" }).click();
    await page.getByRole("button", { name: "選択した履歴を削除" }).click();
    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(dialog).toContainText("保存を再試行");
    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
  } else {
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(checks.nth(1)).toBeChecked();
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("ファイルへの保存を許可");
    await expect(entries).toHaveCount(3);
    await page.getByRole("button", { name: "次の許可を承認" }).click();
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "選択した履歴を削除" }).click();
    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
  }
  await expect(dialog).not.toBeVisible();
  await expect(entries).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: `/tmp/triadic-history-permission-${mode}.png` });
});
