import { test, expect, selectClassification, settleMotion } from './fixtures';

// All file writes in this flow use the existing in-memory preview boundary.
test('前年見込と実績の独立編集・コピー確認・予算別基準と画面別保持', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=defaults');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  const navigate = async (name: string) => {
    const button = app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true });
    if (!await button.isVisible()) await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
    await button.click();
    await expect(app.getByRole('heading', { name, exact: true })).toBeVisible();
    await app.getByRole('heading', { name, exact: true }).click();
    const close = app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).last();
    if (await close.isVisible()) await close.click();
    await settleMotion(app.locator('body'));
  };
  await navigate('前年入力');
  await app.getByLabel('部署名', { exact: true }).selectOption({ label: '部署A' });
  await app.getByLabel('業種名', { exact: true }).selectOption({ label: '直営自動車' });
  const kind = app.getByRole('spinbutton', { name: '前年', exact: true });
  // The input's accessible name is read from the production component.
  const cell = app.getByRole('textbox', { name: '売上高 4月の前年金額', exact: true });
  await expect(cell).toBeVisible();
  await cell.fill('100'); await cell.press('Tab');
  await expect(kind).toHaveAttribute('aria-disabled', 'false');
  await selectClassification(kind, '前年実績');
  await expect(cell).toHaveValue('0');
  await cell.fill('110'); await cell.press('Tab');
  await expect(kind).toHaveAttribute('aria-disabled', 'false');
  const copy = app.getByRole('button', { name: '前年見込からコピー', exact: true });
  await copy.click();
  const confirm = app.getByRole('alertdialog', { name: '前年見込からコピー', exact: true });
  await expect(confirm).toContainText('部署A・直営自動車');
  await confirm.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(cell).toHaveValue('110');
  await copy.click(); await confirm.getByRole('button', { name: 'コピー', exact: true }).click();
  await expect(cell).toHaveValue('100');
  await expect(kind).toHaveAttribute('aria-disabled', 'false');
  await selectClassification(kind, '前年見込');
  await expect(copy).toHaveCount(0);
  await cell.fill('200'); await cell.press('Tab');
  await expect(kind).toHaveAttribute('aria-disabled', 'false');
  await selectClassification(kind, '前年実績');
  await expect(cell).toHaveValue('100');
  await navigate('総原価表');
  const basis = app.getByRole('checkbox', { name: '前年実績を基準にした一次予算', exact: true });
  await expect(basis).not.toBeChecked();
  const sales = app.getByRole('table', { name: '総原価表', exact: true }).getByRole('row').filter({ hasText: /^売上高/ }).first();
  await expect(sales.locator('td').first()).toHaveText('200');
  await basis.click();
  await expect(sales.locator('td').first()).toHaveText('100');
  await app.getByRole('checkbox', {name:'前年実績を基準にした確定予算',exact:true}).click();
  await expect(app.getByRole('checkbox', {name:'前年実績を基準にした確定予算',exact:true})).toBeChecked();
  await expect(sales.locator('td').nth(1)).toHaveText('100');
  await expect(sales.locator('td').nth(2)).toHaveText('');
  await navigate('展開表');
  await expect(basis).not.toBeChecked();
  await expect(app.getByRole('rowheader', { name: '前年見込', exact: true })).toBeVisible();
  expect(await app.locator('.expansion-table-page .comparison-selection').evaluate(node => [...node.querySelectorAll('input')].every(item => { const rect = item.getBoundingClientRect(); return rect.left >= 0 && rect.right <= window.innerWidth; }))).toBe(true);
  await navigate('総原価表');
  await expect(basis).toBeChecked();
  await expect(sales.locator('td').first()).toHaveText('100');
});

test('基準前年の保存失敗は表示と保存済みの選択を保持する', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?scenario=save-failure');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '総原価表', exact: true }).click();
  const basis = app.getByRole('checkbox', { name: '前年実績を基準にした一次予算', exact: true });
  await basis.click();
  await expect(app.getByRole('alert')).toContainText('保存失敗');
  await expect(basis).not.toBeChecked();
  await expect(app.getByRole('table', { name: '総原価表', exact: true }).getByRole('columnheader', { name: '前年見込', exact: true })).toHaveCount(19);
});
