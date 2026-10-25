import { test, expect, settleMotion } from "./fixtures";
import { test as standalone } from "@playwright/test";

test("履歴と現在の年間・月別収支を一次と確定で比較し、変更項目も確認できる", async ({ page, app }, info) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "履歴", exact: true }).click();
  await app.getByRole("button", { name: /と現在の差分$/ }).last().click();
  const dialog = app.getByRole("dialog"), table = dialog.getByRole("table", { name: "履歴と現在の収支への影響", exact: true });
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await expect(table.getByRole("row").filter({ hasText: "売上" }).getByRole("cell").last()).toHaveText("+20");
  await expect(table.getByRole("row").filter({ hasText: "費用" }).getByRole("cell").last()).toHaveText("0");
  await expect(table.getByRole("row").filter({ hasText: "利益" }).getByRole("cell").last()).toHaveText("+20");
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadic-history-income-${info.project.name}.png` });
  await dialog.getByRole("combobox", { name: "表示期間", exact: true }).selectOption("months");
  await expect(table.locator("tbody tr")).toHaveCount(36);
  await expect(table.getByRole("row").filter({ hasText: "4月" }).filter({ hasText: "売上" }).getByRole("cell").last()).toHaveText("+20");
  await expect(table.getByRole("row").filter({ hasText: "5月" }).filter({ hasText: "利益" }).getByRole("cell").last()).toHaveText("0");
  await dialog.getByRole("combobox", { name: "予算種別", exact: true }).selectOption("2");
  await expect(table.getByRole("row").filter({ hasText: "4月" }).filter({ hasText: "売上" }).getByRole("cell").last()).toHaveText("0");
  await dialog.getByRole("button", { name: "変更項目", exact: true }).click();
  await expect(dialog.getByLabel("差分件数")).toHaveText("2件 / 全2件");
  await dialog.getByRole("button", { name: "収支への影響", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "予算種別", exact: true })).toHaveValue("2");
  await expect(dialog.getByRole("combobox", { name: "表示期間", exact: true })).toHaveValue("months");
  await expect(table.locator("tbody tr")).toHaveCount(36);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).press("Escape");
  await expect(app.locator(".history-date")).toHaveCount(3);
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
});

standalone("上限超過は対象の値だけに表示し、1円の正負と変更項目を保持する", async ({ page }) => {
  await page.goto("/tests/ui/history-difference.html");
  const dialog = page.getByRole("dialog"), table = dialog.getByRole("table", { name: "履歴と現在の収支への影響", exact: true });
  await expect(table.getByRole("row").filter({ hasText: "売上" })).toContainText("範囲超過");
  await expect(table.getByRole("row").filter({ hasText: "費用" }).getByRole("cell").last()).toHaveText("+0.001");
  await expect(table.getByRole("row").filter({ hasText: "利益" }).getByRole("cell").last()).toHaveText("-0.001");
  await expect(dialog.getByRole("status")).toContainText("変更項目は引き続き確認");
  await dialog.getByRole("button", { name: "変更項目", exact: true }).click();
  await expect(dialog.getByLabel("差分件数")).toHaveText("125件 / 全125件");
});
