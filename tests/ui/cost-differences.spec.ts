import { selectBudgets } from "./fixtures";
import { test, expect } from "./fixtures";

test("総原価表は予算の選択に応じて前年差と差額 確定予算 − 一次予算を表示する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("complementary", { name: "メニュー", exact: true }).getByRole("button", { name: "総原価表", exact: true }).click();
  const table = app.getByRole("table", { name: "総原価表", exact: true });
  const sales = table.getByRole("row").filter({ has: app.getByRole("rowheader", { name: "売上高", exact: true }) });
  await expect(table.getByRole("columnheader", { name: "前年差", exact: true })).toHaveCount(19);
  await expect(table.getByRole("columnheader", { name: "差額 確定予算 − 一次予算", exact: true })).toHaveCount(0);
  await expect(sales.getByRole("cell").nth(2)).toHaveText("350");
  await selectBudgets(app, [1, 2]);
  await expect(table.getByRole("columnheader", { name: "差額 確定予算 − 一次予算", exact: true })).toHaveCount(19);
  await expect(sales.getByRole("cell").nth(2)).toHaveText("30");
  await expect(sales.getByRole("cell").nth(5)).toHaveText("-100");
  await selectBudgets(app, [1]);
  await selectBudgets(app, [2]);
  await expect(table.getByRole("columnheader", { name: "前年差", exact: true })).toHaveCount(19);
  await expect(table.getByRole("columnheader", { name: "差額 確定予算 − 一次予算", exact: true })).toHaveCount(0);
  await expect(sales.getByRole("cell").nth(2)).toHaveText("380");
  await selectBudgets(app, [1, 2]);
  await expect(table.locator("thead tr").nth(1).getByRole("columnheader").nth(0)).toHaveText("一次予算 前年見込基準");
  await expect(sales.getByRole("cell").nth(2)).toHaveText("30");
});
