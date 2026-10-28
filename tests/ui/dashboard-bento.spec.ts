import { test, expect } from "@playwright/test";

test("グラフのクリックで対象を減らさず、表示条件から月と比較種別を選べる", async ({ page }) => {
  await page.goto("/dev-tools/dashboard-bento/index.html");
  const amounts = page.locator(".dashboard-stat strong");
  const original = ["12,702,061", "833,696", "6.6%"];
  await expect(amounts).toHaveText(original);
  const point = page.locator(".dashboard-chart").first().locator(".dashboard-series-0 .dashboard-chart-point").filter({ hasText: /^6月 一次予算 / });
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


test("施策詳細ダイアログを表示中の施策名で識別し、閉じるとEscを使える", async ({ page }) => {
  await page.goto("/dev-tools/dashboard-bento/index.html");
  const buttons = page.locator(".dashboard-rank .initiative-name-button");
  await expect(buttons.first()).toBeVisible();
  const names = await buttons.allTextContents();
  expect(new Set(names.slice(0, 2)).size).toBe(2);
  for (const [index, name] of names.slice(0, 2).entries()) {
    await buttons.nth(index).click();
    const dialog = page.getByRole("dialog", { name: `${name} · 月別増減`, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(`${name} · 月別増減`);
    expect(await dialog.ariaSnapshot()).toContain(`${name} · 月別増減`);
    const rows = await dialog.locator("tbody tr").allTextContents();
    expect(rows.length).toBe(12);
    if (index === 0) await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    else await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await buttons.nth(index).click();
    await expect(dialog.locator("tbody tr")).toHaveText(rows);
    await page.keyboard.press("Escape");
  }
  await expect(page.locator(".floating-trigger")).toContainText("年間");
});
