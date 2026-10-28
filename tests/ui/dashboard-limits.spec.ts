import { test, expect } from '@playwright/test';

for (const sign of ['positive', 'negative']) test(`ダッシュボードの${sign}な上限付近の金額を表示できる`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/tests/ui/dashboard-analysis.html?mode=axis-${sign}`);
  await expect(page.getByRole('heading', { name: '展開 × 月別の利益増減', exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-stat strong').first()).toContainText('8,500,000,000,000');
  await expect(page.locator('.analysis-axis text').filter({ hasText: '9,180,000,000,000' })).not.toHaveCount(0);
  expect(errors).toEqual([]);
});
