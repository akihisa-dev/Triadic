import { test, expect, settleMotion } from "./fixtures";
import { test as standalone } from "@playwright/test";

test("検索語は閉じる・Esc・詳細移動で保持し、ファイルを閉じると破棄する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const trigger = app.getByRole("button", { name: "施策を検索", exact: true });
  const dialog = app.getByRole("dialog", { name: "施策を検索", exact: true });
  const input = dialog.getByRole("searchbox");
  for (const way of ["button", "escape", "detail"]) {
    await trigger.click();
    await input.fill("代理店 販売");
    if (way === "button") await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    else if (way === "escape") await input.press("Escape");
    else await input.press("Enter");
    await expect(dialog).toHaveCount(0);
    if (way !== "detail") await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("代理店 販売");
    await expect(dialog.getByLabel("検索結果件数")).toHaveText("1件 / 全14件");
    await input.press("Escape");
  }
  await settleMotion(app.locator("body"));
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog", { name: "閉じる", exact: true }).getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await trigger.click();
  await expect(input).toHaveValue("");
});

standalone("再表示は最新データを再検索し結果とページは保持しない", async ({ page }) => {
  await page.goto("/tests/ui/initiative-search.html");
  const trigger = page.getByRole("button", { name: "施策を検索", exact: true });
  const dialog = page.getByRole("dialog");
  await trigger.click();
  await dialog.getByRole("searchbox").fill("確認施策");
  await dialog.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "確認施策51", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await trigger.click();
  await expect(dialog.getByRole("searchbox")).toHaveValue("確認施策");
  await expect(dialog.getByRole("button", { name: "確認施策1", exact: true })).toBeVisible();
  await dialog.getByRole("searchbox").press("Escape");
  await page.getByRole("button", { name: "対象を切り替え", exact: true }).click();
  await trigger.click();
  await expect(dialog.getByRole("searchbox")).toHaveValue("確認施策");
  await expect(dialog).toContainText("登録された施策はありません。");
});
