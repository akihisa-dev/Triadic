import { test, expect, settleMotion } from './fixtures';

for (const width of [320, 375]) for (const name of ['総原価表', '展開表', '施策一覧']) test(`${width}pxの${name}は選択した金額の全桁を表示する`, async ({ page, app }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/tests/ui/preview.html?data=full');
  await page.addStyleTag({ content: '.test-toolbar{display:none!important} #app-preview{height:100vh}' });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  await app.locator('.home-brand').hover(); await settleMotion(app.locator('body'));
  const table = app.getByRole('table', { name, exact: true }), region = table.locator('..');
  const visible = async () => {
    const result = await table.locator('[data-range-selected="true"]').evaluate(cell => {
      const container = cell.closest('table')!.parentElement!, viewport = container.getBoundingClientRect();
      const origin = viewport.left + container.clientLeft;
      const fixed = [...cell.closest('table')!.tHead!.rows[0]!.cells].reduce((edge, header) => {
        const style = getComputedStyle(header);
        return style.position === 'sticky' && style.left !== 'auto' ? Math.max(edge, origin + parseFloat(style.left) + header.getBoundingClientRect().width) : edge;
      }, origin);
      const target = cell.querySelector('button') ?? cell;
      const range = document.createRange(); range.selectNodeContents(target);
      const bounds = range.getBoundingClientRect();
      return { text: target.textContent, left: bounds.left, right: bounds.right, visibleLeft: fixed, visibleRight: origin + container.clientWidth };
    });
    expect(result.text).not.toBe('');
    expect(result.left).toBeGreaterThanOrEqual(result.visibleLeft - 1);
    expect(result.right).toBeLessThanOrEqual(result.visibleRight + 1);
  };
  await region.focus(); await region.press('ArrowRight'); await visible();
  await region.press('ArrowRight'); await region.press('ArrowLeft'); await visible();
  // Recalculate against the width left by an expanded sidebar, then return to the rail.
  const trigger = app.locator('.home-header').getByRole('button', { name: /サイドバー/ });
  await trigger.click(); await settleMotion(app.locator('body'));
  await trigger.click(); await settleMotion(app.locator('body'));
  await region.focus(); await region.press('ArrowRight'); await region.press('ArrowLeft'); await visible();
});
