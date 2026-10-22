import { test, expect } from "@playwright/test";
for (const aggregation of [false, true]) {
  test(`${aggregation ? "集計" : "期間"}の古い削除確認は再作成された対象を削除しない`, async ({ page }) => {
    await page.goto(`/tests/ui/master-delete-sharing.html${aggregation ? "?aggregation" : ""}`);
    const requestDelete = async (name: string) => {
      if (aggregation) {
        await page.getByRole("rowheader", { name, exact: true }).dblclick();
        await page.getByRole("button", { name: "削除", exact: true }).click();
      } else await page.getByRole("button", { name: `${name}を削除`, exact: true }).click();
    };
    await requestDelete("確認した対象");
    await expect(page.getByRole("alertdialog")).toContainText("確認した対象");
    await page.getByRole("button", { name: "別画面で対象を作り直す", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByLabel("保存された対象")).toContainText("作り直した対象");
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("削除対象");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByLabel("保存された対象")).toContainText("作り直した対象");
    await requestDelete("作り直した対象");
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(page.getByLabel("保存された対象")).toContainText("作り直した対象");
    await requestDelete("作り直した対象");
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(page.getByLabel("保存された対象")).not.toContainText("作り直した対象");
  });
}
