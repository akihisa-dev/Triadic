import { test, expect } from '@playwright/test';
test('5000施策の相殺0の行・末尾・施策遷移・再計算と閉じる焦点を保つ', async ({ page }) => {
  const started = performance.now(); await page.goto('/tests/ui/breakdown-window.html');
  const trigger = page.getByRole('button', { name: '内訳を開く', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog'), rows = dialog.locator('tr[data-window-row]');
  await expect.poll(() => rows.count()).toBeLessThan(80);
  await expect(rows.first().locator('td').last()).toHaveText('0');
  await dialog.locator('.cost-breakdown-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(dialog.locator('tr[data-window-row="4999"]')).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.locator('.cost-breakdown-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await dialog.getByRole('button', { name: '確認施策5000（1行目）', exact: true }).click();
  await expect(page.getByTestId('selected')).toHaveText('5000');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await page.getByRole('button', { name: '金額を更新', exact: true }).click();
  await trigger.click();
  await expect(dialog.locator('tfoot td')).toHaveText('1');
  await expect.poll(() => rows.count()).toBeLessThan(80);
  console.log(`内訳5000行: 操作確認${Math.round(performance.now() - started)}ms、描画${await rows.count()}行`);
});


test('5000行の全件を並べ替え、先頭へ戻して正しい施策を開く', async ({ page }) => {
  await page.goto('/tests/ui/breakdown-window.html');
  await page.getByRole('button', { name: '内訳を開く', exact: true }).click();
  const dialog = page.getByRole('dialog'), rows = dialog.locator('tr[data-window-row]');
  await dialog.locator('.cost-breakdown-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
  const header = dialog.getByRole('button', { name: '前年・施策', exact: true });
  await header.click();
  await expect(rows.first().locator('th')).toContainText('確認施策1・');
  await header.press('Space');
  await expect(rows.first().locator('th')).toHaveText('確認施策5000（1行目）');
  await expect.poll(() => rows.count()).toBeLessThan(80);
  await expect(dialog.locator('tfoot td')).toHaveText('0');
  await dialog.getByRole('button', { name: '確認施策5000（1行目）', exact: true }).click();
  await expect(page.getByTestId('selected')).toHaveText('5000');
});
