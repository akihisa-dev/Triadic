import { test, expect } from './fixtures';
test('展開表は非表示の基準前年差が超過しても両予算と表示用前年を独立表示する', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=overflow-expansion-baseline-difference');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '展開表', exact: true }).click();
  const table = app.getByRole('table', { name: '展開表', exact: true });
  for (const prior of ['見込', '実績']) {
    const box = app.getByRole('checkbox', { name: `前年列に前年${prior}を表示`, exact: true });
    if (!await box.isChecked()) await box.click();
    await expect(box).toBeChecked();
    await expect(table).toBeVisible(); await expect(app.getByRole('alert')).toHaveCount(0);
    await expect(table.locator('.expansion-previous th')).toHaveText(`前年${prior}`);
    const total = table.locator('thead tr').filter({ has: app.getByRole('rowheader', { name: '合計', exact: true }) });
    expect((await total.locator('td').allTextContents()).slice(0, 6)).toEqual(['3,000,000,000,000', '3,000,000,000,000', '-3,000,000,000,000', '-3,000,000,000,000', '-6,000,000,000,000', '-6,000,000,000,000']);
  }
});
