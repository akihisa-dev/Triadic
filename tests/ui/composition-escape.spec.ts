import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

async function compositionEscape(page: Page, input: Locator, panel: Locator, nativeDialog?: Locator) {
  await input.fill('既存');
  await input.press('End');
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 });
    await expect(input).toHaveValue('既存にほん');
    if (nativeDialog) {
      // Exercise the native cancel path while the browser owns a composition.
      await nativeDialog.evaluate((node: HTMLDialogElement) => node.requestClose());
      await expect(nativeDialog).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await expect(input).toBeFocused();
    expect(await input.inputValue()).toMatch(/^既存/);
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await input.dispatchEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true });
    await expect(panel).toBeVisible();
    await input.press('Escape');
    await expect(panel).toHaveCount(0);
  } finally { await cdp.detach(); }
}

test('変換中Escは絞り込み・検索・履歴差分を保持し、通常Escは操作元へ戻す', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('main', { name: '作業を選択', exact: true }).getByRole('button', { name: '一次予算', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '施策一覧', exact: true }).click();
  const filter = app.getByRole('button', { name: '施策名を絞り込む', exact: true });
  await filter.click();
  const panel = app.locator('.table-filter-panel');
  await compositionEscape(page, panel.getByLabel('含む文字', { exact: true }), panel);
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute('aria-expanded', 'false');
  await expect(app.locator('.initiative-name-button')).toHaveCount(14);

  const search = app.getByRole('button', { name: '施策を検索', exact: true });
  await search.click();
  const searchDialog = app.getByRole('dialog', { name: '施策を検索', exact: true });
  await compositionEscape(page, searchDialog.getByRole('searchbox'), searchDialog, searchDialog);
  await expect(search).toBeFocused();
  await search.click();
  expect(await searchDialog.getByRole('searchbox').inputValue()).toMatch(/^既存/);
  await searchDialog.getByRole('searchbox').fill('既存商品の販売拡大');
  await searchDialog.getByRole('searchbox').press('Enter');
  await expect(app.getByRole('textbox', { name: '施策名', exact: true })).toHaveValue('既存商品の販売拡大');

  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '履歴', exact: true }).click();
  const compare = app.getByRole('button', { name: /と現在の差分$/ }).last();
  await compare.click();
  const history = app.getByRole('dialog', { name: '履歴と現在の差分', exact: true });
  await history.getByRole('button', { name: '変更項目', exact: true }).click();
  const itemFilter = history.getByRole('button', { name: '項目を絞り込む', exact: true });
  await itemFilter.click();
  await compositionEscape(page, panel.getByLabel('含む文字', { exact: true }), panel, history);
  await expect(history).toBeVisible();
  await expect(itemFilter).toBeFocused();
  await compositionEscape(page, history.getByRole('searchbox', { name: '検索', exact: true }), history, history);
  await expect(compare).toBeFocused();
  await expect(app.locator('.history-date')).toHaveCount(3);
});
