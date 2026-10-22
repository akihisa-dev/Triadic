import { test, expect, type Page } from "@playwright/test";
const saved = async (page: Page) => JSON.parse(await page.getByLabel("SQLite保存内容", { exact: true }).innerText());
async function confirmItemB(page: Page, item = 1) {
  await page.getByRole("table", { name: "パーツ 4の表", exact: true }).dblclick();
  await page.locator(`[data-item="${item}"][data-column="0"]`).click();
  await page.getByRole("button", { name: "項目を削除", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "項目を削除" })).toBeVisible();
}
for (const vertical of [false, true]) {
  test(`明細表の削除確認は共有更新で無効になり、再選択と取消ができる（${vertical ? "縦" : "横"}）`, async ({ page }) => {
    for (const operation of ["表の先頭に追加", "表の先頭を削除", "表の対象を更新"]) {
      await page.goto(`/tests/ui/detail-operations.html${vertical ? "?vertical" : ""}`);
      await confirmItemB(page);
      await page.getByRole("button", { name: operation, exact: true }).evaluate((button: HTMLButtonElement) => button.click());
      await expect(page.getByRole("alertdialog", { name: "項目を削除" })).toHaveCount(0);
      await expect(page.getByRole("toolbar", { name: "項目の操作" })).toHaveCount(0);
      expect((await saved(page)).revision).toBe(1);
      expect((await saved(page)).parts[3].cells.map((row: string[]) => row[0])).toEqual(operation === "表の先頭に追加" ? ["新しい項目", "項目A", "項目B"] : operation === "表の先頭を削除" ? ["項目B"] : ["項目A", "更新した項目B"]);
      if (operation === "表の先頭に追加") {
        await confirmItemB(page, 2);
        await page.getByRole("button", { name: "削除する", exact: true }).click();
        await expect.poll(async () => (await saved(page)).revision).toBe(2);
        expect((await saved(page)).parts[3].cells.map((row: string[]) => row[0])).toEqual(["新しい項目", "項目A"]);
      }
    }
    await page.goto(`/tests/ui/detail-operations.html${vertical ? "?vertical" : ""}`);
    await confirmItemB(page);
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    expect((await saved(page)).revision).toBe(0);
    await page.getByRole("button", { name: "項目を削除", exact: true }).click();
    await page.getByRole("button", { name: "文章だけ更新", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(async () => (await saved(page)).revision).toBe(1);
    await expect(page.getByRole("alertdialog", { name: "項目を削除" })).toBeVisible();
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBe(2);
    expect((await saved(page)).parts[3].cells.map((row: string[]) => row[0])).toEqual(["項目A"]);
    expect((await saved(page)).parts[0].text).toBe("無関係の共有文章");
  });
}
