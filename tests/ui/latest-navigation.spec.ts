import { test, expect } from './fixtures';

test('保存待ちで履歴と通常画面を連続指定しても最後の行先と一致する', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.locator('body').evaluate(async () => {
    const path = '/Triadichrome-extension/src/extension/flushAutoSaves.ts';
    const { registerAutoSave } = await import(path);
    let pending = true, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const unregister = registerAutoSave({ getSnapshot: () => ({ pending, saving: false, error: '' }),
      subscribe: () => () => {}, isComposing: () => false,
      flush: async () => { await gate; pending = false; } });
    Reflect.set(window, 'releaseNavigationTest', () => { release(); unregister(); });
  });
  const menu = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await menu.getByRole('button', { name: '履歴', exact: true }).click();
  await menu.getByRole('button', { name: '総原価表', exact: true }).click();
  await menu.getByRole('button', { name: '前年入力', exact: true }).click();
  await app.locator('body').evaluate(() => Reflect.get(window, 'releaseNavigationTest')());
  await expect(app.getByRole('heading', { name: '前年入力', exact: true })).toBeVisible();
  await expect(app.getByRole('button', { name: 'ウィンドウを複製', exact: true })).toBeEnabled();
  await menu.getByRole('button', { name: '履歴', exact: true }).click();
  await expect(app.getByRole('heading', { name: '履歴', exact: true })).toBeVisible();
  await expect(app.getByRole('button', { name: 'ウィンドウを複製', exact: true })).toBeDisabled();
});
