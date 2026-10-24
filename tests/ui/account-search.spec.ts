import { test, expect } from '@playwright/test';
import { selectAccount } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/ui/performance-preview.html?mode=initiative&count=12&rows=3');
});

test('既存欄で部分一致検索し、決定するまで科目と金額を保持する', async ({ page }) => {
  const field = page.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  const cell = page.locator('input[data-row="0"][data-column="0"]');
  await expect(field).toHaveValue('科目0');
  const before = await cell.boundingBox();
  await field.click();
  await expect(page.getByRole('option')).toHaveCount(13);
  await field.fill('目5');
  await expect(page.getByRole('option')).toHaveText(['科目5']);
  await page.screenshot({ path: `/tmp/triadichrome-account-search-${page.viewportSize()!.width}.png` });
  await expect(cell).toHaveAttribute('aria-label', '科目0 4月の金額');
  await expect(cell).toHaveValue('0');
  await field.press('Escape');
  await expect(field).toHaveValue('科目0');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(field).toBeFocused();
  await field.fill('目5');
  await field.press('Enter');
  await expect(field).toHaveValue('科目5');
  await expect(cell).toHaveAttribute('aria-label', '科目5 4月の金額');
  await expect(cell).toHaveValue('0');
  expect((await cell.boundingBox())!.height).toBe(before!.height);
});

test('該当なし・Tab・フォーカス移動は選択を確定せず、再表示では全候補に戻る', async ({ page }) => {
  const field = page.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await field.fill('存在しない科目');
  await expect(page.getByRole('listbox').getByRole('status')).toHaveText('該当する科目がありません');
  await field.press('Enter');
  await expect(field).toHaveValue('存在しない科目');
  await field.press('Tab');
  await expect(field).toHaveValue('科目0');
  await field.click();
  await expect(page.getByRole('option')).toHaveCount(13);
  await field.fill('目7');
  await page.locator('input[data-row="0"][data-column="0"]').click();
  await expect(field).toHaveValue('科目0');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await selectAccount(field, { label: '科目7' });
  await expect(field).toHaveValue('科目7');
  await selectAccount(field, '');
  await expect(field).toHaveValue('');
  await expect(page.locator('input[data-row="0"][data-column="0"]')).toBeDisabled();
});

test('日本語変換中と変換確定キーでは科目を決定しない', async ({ page }) => {
  const field = page.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await field.fill('目5');
  await field.dispatchEvent('compositionstart');
  await field.press('ArrowDown');
  await field.press('Enter');
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('input[data-row="0"][data-column="0"]')).toHaveAttribute('aria-label', '科目0 4月の金額');
  await field.dispatchEvent('compositionend');
  await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await field.press('Enter');
  await expect(field).toHaveValue('科目5');
});

test('選択済みの欄をクリックしてそのまま文字を打ち、候補を選び直せる', async ({ page }) => {
  const field = page.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await field.click();
  await field.pressSequentially('目5');
  await expect(field).toHaveValue('目5');
  await expect(page.getByRole('option')).toHaveText(['科目5']);
  await field.press('Escape');
  await field.click();
  await field.pressSequentially('目7');
  await expect(page.getByRole('option')).toHaveText(['科目7']);
});

test('狭い画面でも候補は画面内に表示し、金額入力後は科目変更を禁止する', async ({ page }) => {
  const field = page.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await field.click();
  const list = page.getByRole('listbox');
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('option', { name: '科目5', exact: true }).click();
  const cell = page.locator('input[data-row="0"][data-column="0"]');
  await cell.fill('0.001');
  await expect(field).toBeDisabled();
  await expect(field).toHaveValue('科目5');
  await expect(cell).toHaveValue('0.001');
});
