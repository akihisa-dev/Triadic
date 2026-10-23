import { test, expect } from "./runtime-errors";

test("外部削除後も未保存入力を保持し、新規施策へ引き継げる", async ({ page }) => {
  await page.goto("/tests/ui/initiative-source-removal.html");
  await page.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await page.locator(".initiative-name-button").first().click();
  const note = page.getByRole("textbox", { name: "備考", exact: true });
  await note.fill("削除後も残す入力");
  await page.getByRole("button", { name: "外部で施策を削除", exact: true }).click();
  await expect(note).toHaveValue("削除後も残す入力");
  await expect(page.getByRole("alert")).toContainText("編集対象が別のデータに変更されています");
  await page.getByRole("button", { name: "新規施策として入力を引き継ぐ", exact: true }).click();
  await expect(note).toHaveValue("削除後も残す入力");
  await expect(page.getByRole("button", { name: "登録", exact: true })).toBeVisible();
});

test("外部削除後に入力を取り消すと存在しない詳細から戻る", async ({ page }) => {
  await page.goto("/tests/ui/initiative-source-removal.html");
  await page.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await page.locator(".initiative-name-button").first().click();
  await page.getByRole("textbox", { name: "備考", exact: true }).fill("取り消す入力");
  await page.getByRole("button", { name: "外部で施策を削除", exact: true }).click();
  await expect(page.getByRole("button", { name: "入力を取り消す", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "入力を取り消す", exact: true }).click();
  await expect(page.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});
