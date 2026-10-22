import { PNG } from 'pngjs';
import { test, expect, settleMotion } from './fixtures';
import type { FrameLocator } from '@playwright/test';

const png = new PNG({ width: 120, height: 60 });
png.data.fill(180);
const image = { name: '見積資料.png', mimeType: 'image/png', buffer: PNG.sync.write(png) };

async function openEditor(app: FrameLocator) {
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '明細', exact: true }).click();
  await app.getByRole('button', { name: '＋ 明細を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '明細名', exact: true }).fill('画像の根拠');
  await app.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(app.getByRole('heading', { name: '画像の根拠', exact: true })).toBeVisible();
  const toggle = app.locator('.home-header').getByRole('button', { name: 'サイドバーを閉じる', exact: true });
  if (await toggle.count()) await toggle.click();
  await settleMotion(app.locator('body'));
}

test('画像をドラッグ追加し、選択・比率維持・差替・画面往復・移動・伸縮・削除できる', async ({ app, page }, info) => {
  await openEditor(app);
  const source = app.getByRole('button', { name: '画像パーツを追加', exact: true });
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await app.getByRole('region', { name: 'パーツの編集領域' }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 150, { steps: 10 });
  await page.mouse.up();
  await settleMotion(app.locator('body'));
  const part = app.locator('.detail-part');
  await expect(part).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await part.locator('.detail-image-part').dblclick();
  await (await chooser).setFiles(image);
  const img = part.getByRole('img', { name: image.name });
  await expect(img).toBeVisible();
  await expect(img).toHaveCSS('object-fit', 'contain');
  expect(await img.evaluate((node: HTMLImageElement) => [node.naturalWidth, node.naturalHeight])).toEqual([120, 60]);
  for (const [mimeType, extension] of [['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
    const bytes = await page.evaluate(mime => {
      const canvas = document.createElement('canvas'); canvas.width = 60; canvas.height = 120;
      return Array.from(Uint8Array.from(atob(canvas.toDataURL(mime).split(',')[1]!), char => char.charCodeAt(0)));
    }, mimeType!);
    await part.locator('input[type=file]').setInputFiles({ name: `差替.${extension}`, mimeType: mimeType!, buffer: Buffer.from(bytes) });
    await expect(part.getByRole('img')).toHaveAttribute('alt', `差替.${extension}`);
    expect(await part.getByRole('img').evaluate((node: HTMLImageElement) => [node.naturalWidth, node.naturalHeight])).toEqual([60, 120]);
  }
  const src = await part.getByRole('img').getAttribute('src');
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: '画像の根拠を開く', exact: true }).click();
  await expect(part.getByRole('img')).toHaveAttribute('src', src!);
  const transform = await part.getAttribute('style');
  await part.focus(); await part.press('ArrowRight');
  await expect(part).not.toHaveAttribute('style', transform!);
  const oldWidth = await part.evaluate(node => (node as HTMLElement).style.width);
  await part.locator('.detail-part-grip').press('ArrowRight');
  await expect(part).not.toHaveCSS('width', oldWidth);
  await page.screenshot({ path: `/tmp/triadichrome-image-${info.project.name}.png` });
  await part.hover(); await part.locator('.detail-part-delete').click();
  await expect(part).toHaveCount(0);
});

test('取消・非対応形式・破損では元画像を保持し、ファイル終了で破棄する', async ({ app }) => {
  await openEditor(app);
  await app.getByRole('button', { name: '画像パーツを追加', exact: true }).press('Enter');
  const part = app.locator('.detail-part'), input = part.locator('input[type=file]');
  await input.setInputFiles(image);
  await expect(part.getByRole('img')).toBeVisible();
  const src = await part.getByRole('img').getAttribute('src');
  await input.dispatchEvent('cancel');
  await expect(part.getByRole('img')).toHaveAttribute('src', src!);
  await input.setInputFiles({ name: '非対応.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(part.getByRole('alert')).toContainText('PNG・JPEG・WebP');
  await expect(part.getByRole('img')).toHaveAttribute('src', src!);
  await input.setInputFiles({ name: '破損.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
  await expect(part.getByRole('alert')).toContainText('画像を読み込めませんでした');
  await expect(part.getByRole('img')).toHaveAttribute('src', src!);
  await input.setInputFiles(image);
  await expect(part.getByRole('alert')).toHaveCount(0);
  await app.getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '明細', exact: true }).click();
  await expect(app.locator('.details-table tbody tr')).toHaveCount(0);
});
