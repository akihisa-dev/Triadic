import { test, expect } from '@playwright/test';
for (const late of [false, true]) test(`600科目の総原価表で全列・内訳・焦点・表示復元を保つ${late ? '・売上集計が末尾' : ''}`, async ({ page }) => {
  const started = performance.now(); await page.goto('/tests/ui/cost-window.html' + (late ? '?late-sales' : ''));
  const region = page.getByRole('region', { name: '総原価表の月別前年・種別別金額', exact: true });
  const rows = page.locator('tr.cost-data-row');
  await expect.poll(() => rows.count()).toBeLessThan(100);
  expect(await page.locator('tr[data-column-header]').count()).toBe(2);
  if (late) expect(await page.locator('thead tr.cost-data-row').count()).toBe(0);
  const first = page.getByRole('button', { name: '売上高 4月 一次予算 前年見込基準の内訳', exact: true });
  if (!late) {
    await first.focus(); const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: 360 });
    await expect(first).toBeFocused();
    await page.setViewportSize(size); await expect(first).toBeFocused();
  }
  await region.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const last = page.getByRole('button', { name: '確認科目600 4月 一次予算 前年見込基準の内訳', exact: true });
  await expect(last).toBeVisible(); await last.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(last).toBeFocused();
  await last.press('Tab');
  await expect(page.getByRole('button', { name: '確認科目600 4月 確定予算 前年見込基準の内訳', exact: true })).toBeFocused();
  const before = await region.evaluate(node => [node.scrollTop, node.scrollLeft]);
  await page.getByRole('button', { name: '表示を作り直す', exact: true }).click();
  await expect(page.getByTestId('generation')).toHaveText('1');
  await expect.poll(() => region.evaluate(node => [node.scrollTop, node.scrollLeft])).toEqual(before);
  await expect(last).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(100);
  console.log(`総原価600科目${late ? '・末尾売上' : ''}: 操作確認${Math.round(performance.now() - started)}ms、描画${await rows.count()}行`);
});
