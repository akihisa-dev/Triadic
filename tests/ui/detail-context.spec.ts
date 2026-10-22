import { test, expect, settleMotion } from './fixtures';
import type { FrameLocator, Page } from '@playwright/test';

async function open(app: FrameLocator, page: Page) {
  await page.goto('/tests/ui/preview.html?data=full');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '明細', exact: true }).click();
  await app.getByRole('button', { name: '全パーツの保存確認を開く', exact: true }).click();
  await expect(app.locator('.detail-part')).toHaveCount(7);
}

test('施策参照から一次予算を開き、改名を反映して元の明細へ戻る', async ({ app, page }) => {
  await open(app, page);
  const reference = app.locator('.detail-initiative-part');
  const original = (await reference.locator('.detail-initiative-link').textContent())!;
  await reference.locator('.detail-initiative-link').click();
  await expect(app.getByRole('tab', { name: '一次予算', exact: true })).toHaveAttribute('aria-selected', 'true');
  await app.getByRole('textbox', { name: '施策名', exact: true }).fill('明細参照から変更');
  await app.getByRole('button', { name: '← 明細へ戻る', exact: true }).click();
  await expect(app.getByRole('heading', { name: '全パーツの保存確認', exact: true })).toBeVisible();
  await expect(reference.locator('.detail-initiative-link')).toHaveText('明細参照から変更');
  await app.getByRole('button', { name: '操作を取り消す', exact: true }).click();
  await expect(reference.locator('.detail-initiative-link')).toHaveText(original);
  await reference.getByRole('button', { name: 'パーツ 5の参照施策を変更' }).click();
  const select = reference.getByRole('combobox');
  const replacement = await select.locator('option').nth(2).textContent();
  await select.selectOption({ index: 2 });
  await expect(reference.locator('.detail-initiative-link')).toHaveText(replacement!);
  await reference.locator('.detail-initiative-link').click();
  await expect(app.getByRole('textbox', { name: '施策名', exact: true })).toHaveValue(replacement!);
  await app.getByRole('button', { name: '前の画面に戻る', exact: true }).click();
  await expect(reference.locator('.detail-initiative-link')).toHaveText(replacement!);
});

test('前提条件と見出しを編集し、文字のまま保存・取消・履歴で保持する', async ({ app, page }, info) => {
  await open(app, page);
  const assumption = app.getByRole('button', { name: 'パーツ 6の前提条件を編集', exact: true });
  await assumption.dblclick();
  await app.getByRole('textbox', { name: 'パーツ 6の項目名', exact: true }).fill('配送単価差');
  await app.getByRole('textbox', { name: 'パーツ 6の値', exact: true }).fill('0010.00');
  await app.getByRole('textbox', { name: 'パーツ 6の単位', exact: true }).fill('円／件');
  await app.getByRole('textbox', { name: 'パーツ 6の単位', exact: true }).press('Escape');
  await expect(assumption).toHaveText('配送単価差0010.00円／件');
  await app.getByRole('button', { name: 'パーツ 7の見出しを編集', exact: true }).dblclick();
  await app.getByRole('textbox', { name: 'パーツ 7の見出し', exact: true }).fill('単価改定の根拠');
  await app.getByRole('textbox', { name: 'パーツ 7の見出し', exact: true }).press('Escape');
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: '全パーツの保存確認を開く', exact: true }).click();
  await expect(assumption).toHaveText('配送単価差0010.00円／件');
  await expect(app.getByRole('heading', { name: '単価改定の根拠', exact: true })).toHaveCSS('font-size', '20px');
  await app.getByRole('button', { name: '操作を取り消す', exact: true }).click();
  await expect(app.getByRole('heading', { name: '算定根拠', exact: true })).toBeVisible();
  await app.getByRole('button', { name: '操作をやり直す', exact: true }).click();
  await expect(app.getByRole('heading', { name: '単価改定の根拠', exact: true })).toBeVisible();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '履歴', exact: true }).click();
  await app.locator('.history-date').first().click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '明細', exact: true }).click();
  await app.getByRole('button', { name: '全パーツの保存確認を開く', exact: true }).click();
  await expect(assumption).toHaveText('配送単価差0010.00円／件');
  await expect(assumption).toHaveAttribute('aria-disabled', 'true');
  await expect(app.getByRole('button', { name: 'パーツ 5の参照施策を変更' })).toHaveCount(0);
  await app.locator('.detail-initiative-link').click();
  await expect(app.getByRole('textbox', { name: '施策名', exact: true })).toBeDisabled();
  await app.getByRole('button', { name: '← 明細へ戻る', exact: true }).click();
  await expect(app.getByRole('heading', { name: '単価改定の根拠', exact: true })).toBeVisible();
  await settleMotion(app.locator('body'));
  expect(await app.locator('.home-content').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/triadichrome-detail-context-${info.project.name}.png` });
});

test('3種類をプールから追加し、空で開始して移動・伸縮・削除できる', async ({ app, page }) => {
  await open(app, page);
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: '＋ 明細を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '明細名', exact: true }).fill('新しいパーツ');
  await app.getByRole('button', { name: '次へ', exact: true }).click();
  for (const [i, label] of ['施策参照', '前提条件', '見出し'].entries()) {
    const pool = app.getByRole('button', { name: `${label}パーツを追加`, exact: true });
    await pool.scrollIntoViewIfNeeded();
    const source = (await pool.boundingBox())!;
    const canvas = (await app.getByRole('region', { name: 'パーツの編集領域', exact: true }).boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + Math.min(80 + i * 100, canvas.height - 60), { steps: 10 });
    await page.mouse.up();
    await expect(app.locator('.detail-part')).toHaveCount(i + 1);
  }
  await expect(app.getByRole('combobox', { name: 'パーツ 1の参照施策' })).toHaveValue('');
  await expect(app.getByRole('button', { name: 'パーツ 2の前提条件を編集' })).toHaveText('項目名値単位');
  await expect(app.getByRole('heading', { name: '見出し', exact: true })).toBeVisible();
  const part = app.locator('.detail-part').last();
  await part.focus(); await part.press('ArrowRight');
  const grip = part.getByRole('button', { name: 'パーツ 3の右下でサイズ変更' });
  await grip.focus(); await grip.press('ArrowRight');
  await settleMotion(app.locator('body'));
  expect(await part.evaluate(node => parseFloat((node as HTMLElement).style.width))).toBe(360);
  await part.focus(); await part.press('Delete');
  await expect(app.locator('.detail-part')).toHaveCount(2);
});
