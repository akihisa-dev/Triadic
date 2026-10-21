import { test, expect } from '@playwright/test';
test('67320行でも折り返し・末尾・焦点を維持して必要行だけ描画する', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/ui/table-window.html');
  const rows = page.locator('tr[data-window-row]');
  await expect(page.getByRole('heading')).toContainText('67320件');
  await expect.poll(() => rows.count()).toBeLessThan(80);
  const first = page.getByRole('button', { name: '行1を選択', exact: true });
  await first.focus();
  await page.locator('main > div').evaluate(node => { node.scrollTop = node.scrollHeight; });
  console.log(await page.locator('main > div').evaluate(async node => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const body = node.querySelector('tbody')!;
    const visible = [...body.querySelectorAll('tr[data-window-row]')];
    return { top: node.scrollTop, height: node.scrollHeight, rows: visible.length, first: visible[0]?.getAttribute('data-window-row'), last: visible.at(-1)?.getAttribute('data-window-row') };
  }));
  await expect(page.locator('tr[data-window-row="67319"]')).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(80);
  await expect(first).toBeFocused();
  await first.press('Tab');
  await expect(page.getByRole('button', { name: '行2を選択', exact: true })).toBeFocused();
  const wrapped = page.locator('tr[data-window-row="0"] td').first();
  expect(await wrapped.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(34);
  expect(errors).toEqual([]);
});
