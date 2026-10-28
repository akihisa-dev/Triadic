import { test, expect, settleMotion } from './fixtures';

for (const name of ['総原価表', '展開表', '施策一覧']) test(`${name}は高さ不足でも本文を操作し条件欄へ戻れる`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await page.addStyleTag({ content: '.test-toolbar{display:none!important}#app-preview{display:block;width:100vw;height:100vh;border:0}html,body{margin:0;height:100vh;overflow:hidden}' });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  await app.locator('.home-brand').hover();
  const table = app.getByRole('table', { name, exact: true }), region = table.locator('..'), outer = app.locator('.home-content');
  const width = page.viewportSize()!.width;
  for (const height of [800, 450, 300, 800]) {
    await page.setViewportSize({ width, height });
    await settleMotion(app.locator('body'));
    await expect.poll(() => region.evaluate(node => node.clientHeight)).toBeGreaterThan(75);
    await region.focus(); await region.press('Escape');
    for (let index = 0; index < 8; index++) await region.press('ArrowDown');
    await expect.poll(() => table.locator('[data-range-selected="true"]').evaluate(cell => {
      const region = cell.closest('table')!.parentElement!, outer = region.closest('.home-content')!;
      const bounds = cell.getBoundingClientRect(), viewport = region.getBoundingClientRect(), screen = outer.getBoundingClientRect();
      let top = Math.max(viewport.top + region.clientTop, screen.top), bottom = Math.min(viewport.top + region.clientTop + region.clientHeight, screen.bottom);
      for (const element of [cell.closest('table')!.tHead, ...Array.from(cell.closest('table')!.tHead!.rows), cell.closest('table')!.tFoot]) {
        if (!element || element.contains(cell)) continue;
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        if (style.position !== 'sticky') continue;
        if (style.top !== 'auto') top = Math.max(top, rect.bottom);
        if (style.bottom !== 'auto') bottom = Math.min(bottom, rect.top);
      }
      const x = Math.min(bounds.right - 5, viewport.right - 16), hit = document.elementFromPoint(x, (bounds.top + bounds.bottom) / 2);
      return bounds.top >= top - 1 && bounds.bottom <= bottom + 1 && (cell === hit || cell.contains(hit));
    })).toBe(true);
    if (height === 800) expect(await outer.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
    await outer.evaluate(node => { node.scrollTop = 0; });
    await expect(app.getByRole('heading', { name, exact: true })).toBeInViewport();
  }
});
