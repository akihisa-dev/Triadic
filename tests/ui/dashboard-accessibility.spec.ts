import { test, expect, selectBudgets } from './fixtures';

test('部署別の利益率と前年差を部署・予算・対象期間とともに識別できる', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: 'ダッシュボード', exact: true }).click();
  for (const selected of [[1], [1, 2]]) {
    await app.locator(".dashboard-floating-trigger").click();
    await selectBudgets(app, selected);
    for (const period of ['annual', '4']) {
      await app.locator(".dashboard-floating-trigger").click();
      await app.getByRole("button", { name: period === "annual" ? "年間" : "4月", exact: true }).click();
      const groups = app.locator('.dashboard-department-kind[role="group"]');
      const departments = await app.locator('.dashboard-department-name').count();
      await expect(groups).toHaveCount(departments * selected.length);
      for (const group of await groups.all()) {
        const [value, delta] = await group.locator(':scope > span').allTextContents();
        const label = await group.getAttribute('aria-label');
        expect(label).toMatch(/一次予算|確定予算/);
        expect(label).toContain(period === 'annual' ? '年間' : '4月');
        expect(label).toContain(`利益率 ${value === '—' ? '計算できません' : value}`);
        expect(label).toContain(`前年差 ${delta === '—' ? '計算できません' : delta}`);
        expect(await group.ariaSnapshot()).toContain(label!);
      }
    }
  }
  const first = app.locator('.dashboard-department-name button').first();
  await first.click();
  await expect(app.getByRole('heading', { name: '総原価表', exact: true })).toBeVisible();
});

test('売上0で利益率を計算できない場合も項目名を保持する', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=defaults');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: 'ダッシュボード', exact: true }).click();
  const groups = app.getByRole('group', { name: /利益率 計算できません 前年差 計算できません/ });
  await expect(groups).not.toHaveCount(0);
});
