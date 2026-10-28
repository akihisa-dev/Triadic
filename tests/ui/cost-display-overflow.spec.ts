import { test, expect, selectBudgets } from './fixtures';

for (const scenario of ['annual', 'baseline']) test(`総原価表は非表示の${scenario}超過を除いて各予算を表示する`, async ({ page, app }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/tests/ui/preview.html?data=overflow-cost-${scenario}`);
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '総原価表', exact: true }).click();
  for (const kinds of [[1], [2], [1, 2]]) {
    await selectBudgets(app, kinds);
    await expect(app.getByRole('checkbox', { name: '前年列に前年実績を表示', exact: true })).toBeChecked();
    const table = app.getByRole('table', { name: '総原価表', exact: true });
    await expect(table).toBeVisible();
    await expect(app.getByRole('alert')).toHaveCount(0);
    const row = table.locator('tr[data-cost-row^="account:"]').filter({ has: app.getByRole('rowheader', { name: '売上高', exact: true }) });
    const cells = row.locator('td');
    const count = kinds.length === 1 ? 3 : 5;
    await expect(cells).toHaveCount(19 * count);
    if (scenario === 'annual') {
      const values = await cells.allTextContents();
      expect(values.slice(-count)).toEqual([...Array(kinds.length + 1).fill('6,000,000,000,000'), ...Array(kinds.length === 2 ? 2 : 1).fill('')]);
    } else await expect(cells).toHaveText(Array(19 * count).fill(''));
  }
  await app.getByRole('combobox', { name: '部署名', exact: true }).selectOption({ label: '部署A' });
  await expect(app.getByRole('table', { name: '総原価表', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
