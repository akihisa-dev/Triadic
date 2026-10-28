import { test, expect } from "@playwright/test";

test("グラフのクリックで対象を減らさず、表示条件から月と比較種別を選べる", async ({ page }) => {
  await page.goto("/dev-tools/dashboard-bento/index.html");
  const amounts = page.locator(".dashboard-stat strong");
  const original = ["12,702,061", "833,696", "6.6%"];
  await expect(amounts).toHaveText(original);
  const point = page.locator(".dashboard-chart").first().locator("circle").nth(2);
  await point.click();
  await expect(page.locator(".floating-trigger")).toContainText("年間");
  await page.locator(".dashboard-department .dashboard-bar").first().click();
  await expect(page.locator(".dashboard-department-name")).toHaveCount(8);
  const industry = page.locator('.dashboard-analysis-section[aria-label="業種別の売上構成"] g[data-value]').filter({ hasText: /^直営自動車 \d/ }).locator("text").first();
  await industry.click();
  await expect(amounts).toHaveText(original);
  await expect(page.locator(".slice-summary, .slice-selects")).toHaveCount(0);
  await page.locator(".floating-trigger").press("Enter");
  await page.getByRole("button", { name: "6月", exact: true }).click();
  await expect(page.locator(".floating-trigger")).toContainText("6月");
  await page.getByRole("button", { name: "年間に戻す", exact: true }).click();
  await expect(page.locator(".floating-trigger")).toContainText("年間");
  await expect(amounts).toHaveText(original);
});
