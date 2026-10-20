import { test, expect, settleMotion } from './fixtures';
import type { FrameLocator, Page } from '@playwright/test';

async function openEditor(app: FrameLocator) {
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '明細', exact: true }).click();
  await app.getByRole('button', { name: '＋ 明細を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '明細名', exact: true }).fill('パーツ配置');
  await app.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(app.getByRole('heading', { name: 'パーツ配置', exact: true })).toBeVisible();
  const headerToggle = app.locator('.home-header').getByRole('button', { name: 'サイドバーを閉じる', exact: true });
  if (await headerToggle.count()) await headerToggle.click();
  await settleMotion(app.locator('body'));
}
async function dropPart(page: Page, app: FrameLocator, x = 70, y = 90) {
  const source = (await app.getByRole('button', { name: '空のパーツを追加', exact: true }).boundingBox())!;
  const canvas = (await app.getByRole('region', { name: 'パーツの編集領域', exact: true }).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + Math.min(x, canvas.width / 2), canvas.y + Math.min(y, canvas.height / 2), { steps: 12 });
  await page.mouse.up();
  await settleMotion(app.locator('body'));
}
async function rectangles(app: FrameLocator) {
  return app.locator('.detail-part').evaluateAll(nodes => nodes.map(node => {
    const element = node as HTMLElement;
    const matrix = new DOMMatrix(element.style.transform);
    return { x: matrix.m41, y: matrix.m42, width: parseFloat(element.style.width), height: parseFloat(element.style.height) };
  }));
}

test('プールから空パーツを繰り返し置き、押し出し・ホバー・削除・画面往復を確認する', async ({ app, page }, info) => {
  await openEditor(app);
  await dropPart(page, app);
  await expect(app.locator('.detail-part')).toHaveCount(1);
  await expect(app.locator('.detail-part').first()).toHaveText('×');
  await expect(app.getByRole('button', { name: '空のパーツを追加', exact: true })).toBeVisible();
  await dropPart(page, app);
  await expect(app.locator('.detail-part')).toHaveCount(2);
  const rects = await rectangles(app), [a, b] = rects;
  expect(a!.x + a!.width + 4 <= b!.x || b!.x + b!.width + 4 <= a!.x || a!.y + a!.height + 4 <= b!.y || b!.y + b!.height + 4 <= a!.y).toBe(true);
  expect(a!.width).toBe(160); expect(a!.height).toBe(96);
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: 'パーツ配置を開く', exact: true }).click();
  await expect(app.locator('.detail-part')).toHaveCount(2);
  const part = app.locator('.detail-part').last();
  await part.hover();
  await expect(part.locator('.detail-part-delete')).toHaveCSS('opacity', '1');
  await part.locator('.detail-part-delete').click();
  await expect(app.locator('.detail-part')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(app.locator('.detail-part-delete')).toHaveCSS('opacity', '0');
  expect(await app.locator('.home-content').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  if (info.project.name === 'desktop') {
    for (let i = 0; i < 5; i++) await dropPart(page, app, 200 + i * 28, 140 + i * 22);
    await app.locator('.detail-part').last().hover();
    await settleMotion(app.locator('body'));
    await page.screenshot({ path: '/tmp/triadichrome-detail-parts-desktop.png' });
  } else await page.screenshot({ path: '/tmp/triadichrome-detail-parts-narrow.png' });
});

test('四辺のつまみは連続的に伸縮し、離すと16px刻みへ滑らかに収まる', async ({ app, page }, info) => {
  test.skip(info.project.name !== 'desktop', '四辺のポインター操作は通常幅で確認し、狭幅は追加・スクロール・削除を別テストで確認');
  await openEditor(app); await dropPart(page, app, 210, 160);
  for (const [edge, dx, dy] of [['右', 23, 0], ['下', 0, 23], ['左', -23, 0], ['上', 0, -23]] as const) {
    const before = (await rectangles(app))[0]!;
    const grip = app.getByRole('button', { name: `パーツ 1の${edge}端でサイズ変更`, exact: true });
    await app.locator('.detail-part').hover();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
    await expect.poll(async () => (await rectangles(app))[0]![dx ? 'width' : 'height'] % 16).not.toBe(0);
    await page.mouse.up();
    await expect(app.locator('.detail-part')).toHaveCSS('transition-duration', '0.24s, 0.24s, 0.24s, 0.16s');
    await settleMotion(app.locator('body'));
    const after = (await rectangles(app))[0]!;
    expect(after.width % 16).toBe(0); expect(after.height % 16).toBe(0);
    if (edge === '左') expect(after.x + after.width).toBeCloseTo(before.x + before.width, 2);
    if (edge === '上') expect(after.y + after.height).toBeCloseTo(before.y + before.height, 2);
  }
  const grip = app.getByRole('button', { name: 'パーツ 1の右端でサイズ変更', exact: true });
  await app.locator('.detail-part').hover(); const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  await settleMotion(app.locator('body'));
  expect((await rectangles(app))[0]!.width).toBe(64);
});

test('ドラッグのEscと領域外ドロップは配置を変更せず、自動スクロールで画面外へ運べる', async ({ app, page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await openEditor(app); await dropPart(page, app, 200, 140);
  const before = await rectangles(app);
  const part = (await app.locator('.detail-part').boundingBox())!;
  await page.mouse.move(part.x + 30, part.y + 30); await page.mouse.down();
  await page.mouse.move(part.x + 120, part.y + 120, { steps: 8 }); await page.keyboard.press('Escape'); await page.mouse.up();
  await settleMotion(app.locator('body')); expect(await rectangles(app)).toEqual(before);
  const source = (await app.getByRole('button', { name: '空のパーツを追加', exact: true }).boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 20); await page.mouse.down();
  await page.mouse.move(20, 20, { steps: 8 }); await page.mouse.up();
  await expect(app.locator('.detail-part')).toHaveCount(1);
  const canvas = app.getByRole('region', { name: 'パーツの編集領域', exact: true });
  const area = (await canvas.boundingBox())!, current = (await app.locator('.detail-part').boundingBox())!;
  await page.mouse.move(current.x + 30, current.y + 30); await page.mouse.down();
  await page.mouse.move(area.x + area.width - 22, area.y + area.height - 22, { steps: 16 });
  await expect.poll(() => canvas.evaluate(e => e.scrollLeft)).toBeGreaterThan(60);
  await expect.poll(() => canvas.evaluate(e => e.scrollTop)).toBeGreaterThan(60);
  await page.mouse.up(); await settleMotion(app.locator('body'));
  const after = (await rectangles(app))[0]!;
  expect(after.x).toBeGreaterThan(before[0]!.x); expect(after.y).toBeGreaterThan(before[0]!.y);
});
