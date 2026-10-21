import { test, expect } from '@playwright/test';
for (const count of [300,600,900]) test(`${count}科目の前年入力で離れた入力と範囲操作を保持する`, async ({ page }) => {
  await page.goto(`/tests/ui/performance-preview.html?mode=previous&count=${count}&guard`);
  const first = page.getByRole('textbox', { name: '科目0 4月の前年金額', exact: true });
  const second = page.getByRole('textbox', { name: '科目0 5月の前年金額', exact: true });
  const last = page.getByRole('textbox', { name: `科目${count-1} 4月の前年金額`, exact: true });
  await expect(last).toHaveValue('0');
  await first.focus();
  const before = await page.evaluate(() => (window as unknown as { gridMeasurements: unknown[] }).gridMeasurements.length);
  const start = performance.now();
  await first.fill('1.001'); await first.press('Enter');
  await expect(first).toHaveValue('1.001');
  await last.fill('-0.001'); await last.press('Enter');
  await expect(first).toHaveValue('1.001'); await expect(last).toHaveValue('-0.001');
  await first.click(); await first.press('Shift+ArrowRight');
  await expect(second).toBeFocused(); await expect(page.locator('.previous-cell-selected')).toHaveCount(2);
  // Use the real clipboard event contract; the grid handles range replacement.
  await second.evaluate(node => { const clipboardData = new DataTransfer(); clipboardData.setData('text/plain','3\t4'); node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData})); });
  await expect(first).toHaveValue('3'); await expect(second).toHaveValue('4'); await expect(last).toHaveValue('-0.001');
  await second.press('Delete');
  await expect(first).toHaveValue('0'); await expect(second).toHaveValue('0'); await expect(last).toHaveValue('-0.001');
  await first.fill('7.125'); await first.press('Escape'); await expect(first).toHaveValue('0');
  const metrics = await page.evaluate(n => (window as unknown as { gridMeasurements: { phase:string;actualMs:number;baseMs:number }[] }).gridMeasurements.slice(n), before);
  console.log(JSON.stringify({ count, elapsedMs: performance.now()-start, updates:metrics, note:'操作APIとスクロール待ちを含む。React時間は開発ビルド。' }));
});
