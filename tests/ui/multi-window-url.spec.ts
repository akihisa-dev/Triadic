import { test, expect } from './runtime-errors';

test('複製の再参加を維持し、正常終了と別ファイルへの切替後は旧ファイルへ戻らない', async ({ page, context }) => {
  await page.goto('/tests/ui/multi-window.html');
  await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await expect(page.locator('.home-file-name')).toHaveText('ウィンドウ確認.triadic');
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '展開表', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'ウィンドウを複製', exact: true }).click();
  const copy = await popup;
  copy.on('dialog', dialog => { void dialog.accept(); });
  await expect(copy.getByRole('heading', { name: '展開表', exact: true })).toBeVisible();
  const workspace = new URLSearchParams(new URL(copy.url()).hash.slice(1)).get('workspace'); expect(workspace).toBeTruthy();
  expect(new URLSearchParams(new URL(copy.url()).hash.slice(1)).has('view')).toBe(false);
  await copy.reload();
  await expect(copy.locator('.home-file-name')).toHaveText('ウィンドウ確認.triadic');
  expect(new URLSearchParams(new URL(copy.url()).hash.slice(1)).get('workspace')).toBe(workspace);
  const close = async () => {
    await copy.getByRole('complementary', { name: 'メニュー', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
    return copy.getByRole('alertdialog', { name: '閉じる', exact: true });
  };
  await (await close()).getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(copy.getByRole('alertdialog', { name: '閉じる', exact: true })).not.toBeVisible();
  await expect(copy.locator('.home-file-name')).toHaveText('ウィンドウ確認.triadic');
  expect(new URLSearchParams(new URL(copy.url()).hash.slice(1)).get('workspace')).toBe(workspace);
  await (await close()).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(copy.getByRole('button', { name: 'ファイルを開く', exact: true })).toBeVisible();
  expect(new URLSearchParams(new URL(copy.url()).hash.slice(1)).has('workspace')).toBe(false);
  await copy.reload();
  await expect(copy.getByRole('button', { name: 'ファイルを開く', exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/tests/ui/multi-window.html?name=別ファイル.triadic');
  await other.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await expect(other.locator('.home-file-name')).toHaveText('別ファイル.triadic');
  await copy.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('別ファイル.triadic');
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle] });
  });
  await copy.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await expect(copy.locator('.home-file-name')).toHaveText('別ファイル.triadic');
  expect(new URLSearchParams(new URL(copy.url()).hash.slice(1)).has('workspace')).toBe(false);
  await copy.reload();
  await expect(copy.getByRole('button', { name: 'ファイルを開く', exact: true })).toBeVisible();
  await expect(page.locator('.home-file-name')).toHaveText('ウィンドウ確認.triadic');
  await expect(other.locator('.home-file-name')).toHaveText('別ファイル.triadic');
});
