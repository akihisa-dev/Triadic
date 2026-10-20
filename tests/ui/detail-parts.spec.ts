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
  const source = (await app.getByRole('button', { name: 'テキストパーツを追加', exact: true }).boundingBox())!;
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

test('プールからテキストパーツを繰り返し置き、押し出し・ホバー・削除・画面往復を確認する', async ({ app, page }, info) => {
  await openEditor(app);
  await dropPart(page, app);
  await expect(app.locator('.detail-part')).toHaveCount(1);
  await expect(app.locator('.detail-part').first()).toHaveText('ダブルクリックで入力×');
  await expect(app.getByRole('button', { name: 'テキストパーツを追加', exact: true })).toBeVisible();
  await dropPart(page, app);
  await expect(app.locator('.detail-part')).toHaveCount(2);
  const rects = await rectangles(app), [a, b] = rects;
  expect(a!.x + a!.width + 4 <= b!.x || b!.x + b!.width + 4 <= a!.x || a!.y + a!.height + 4 <= b!.y || b!.y + b!.height + 4 <= a!.y).toBe(true);
  expect(a!.width).toBe(160); expect(a!.height).toBe(96);
  for (const rect of rects) { expect(rect.x % 16).toBe(0); expect(rect.y % 16).toBe(0); }
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

test('移動中の吸着と確定時のスナップ、右下だけの斜め伸縮を確認する', async ({ app, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'ポインターの位置と斜め伸縮は通常幅、狭幅は追加・スクロール・削除を別テストで確認');
  await openEditor(app); await dropPart(page, app, 210, 160);
  const canvas = app.locator('.detail-canvas');
  await expect(canvas).toHaveCSS('background-size', '16px 16px');
  expect(await canvas.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('radial-gradient');
  const before = (await rectangles(app))[0]!;
  const partBox = (await app.locator('.detail-part').boundingBox())!;
  await page.mouse.move(partBox.x + 30, partBox.y + 30); await page.mouse.down();
  const destination = app.locator('.detail-part-destination');
  for (const dx of [7, 9, 7, 9]) {
    await page.mouse.move(partBox.x + 30 + dx, partBox.y + 30, { steps: 2 });
    await expect.poll(() => destination.evaluate(e => new DOMMatrix((e as HTMLElement).style.transform).m41)).toBe(before.x);
  }
  await page.mouse.move(partBox.x + 43, partBox.y + 49, { steps: 12 });
  const raw = { x: before.x + 13, y: before.y + 19 };
  const target = { x: Math.round(raw.x / 16) * 16, y: Math.round(raw.y / 16) * 16 };
  await expect.poll(async () => Math.abs((await rectangles(app))[0]!.x - target.x)).toBeLessThan(Math.abs(raw.x - target.x));
  const live = (await rectangles(app))[0]!;
  expect(live.x % 16).not.toBe(0); expect(live.y % 16).not.toBe(0);
  await expect(destination).toBeVisible();
  expect(await destination.evaluate(e => {
    const matrix = new DOMMatrix((e as HTMLElement).style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  })).toEqual(target);
  await expect(destination).toHaveCSS('background-color', 'rgba(57, 121, 230, 0.14)');
  await expect(destination).toHaveCSS('pointer-events', 'none');
  await expect(destination).toHaveCSS('transition-duration', '0.1s');
  // Return across the nearest-point boundary without changing the indicated landing position.
  await page.mouse.move(partBox.x + 37, partBox.y + 49, { steps: 4 });
  await expect.poll(() => destination.evaluate(e => new DOMMatrix((e as HTMLElement).style.transform).m41)).toBe(target.x);
  await page.screenshot({ path: '/tmp/triadichrome-detail-destination.png' });
  await page.mouse.up(); await settleMotion(app.locator('body'));
  await expect(destination).toHaveCount(0);
  const snapped = (await rectangles(app))[0]!;
  expect(snapped.x).toBe(target.x); expect(snapped.y).toBe(target.y);
  await expect(app.locator('.detail-part-grip')).toHaveCount(1);
  const grip = app.getByRole('button', { name: 'パーツ 1の右下でサイズ変更', exact: true });
  await app.locator('.detail-part').hover();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 23, box.y + box.height / 2 + 39, { steps: 12 });
  await expect(destination).toHaveCount(0);
  await expect.poll(async () => (await rectangles(app))[0]!.width % 16).not.toBe(0);
  await expect.poll(async () => (await rectangles(app))[0]!.height % 16).not.toBe(0);
  await page.mouse.up();
  await expect(app.locator('.detail-part')).toHaveCSS('transition-duration', '0.24s, 0.24s, 0.24s, 0.16s');
  await settleMotion(app.locator('body'));
  const resized = (await rectangles(app))[0]!;
  expect(resized.width).toBe(176); expect(resized.height).toBe(128);
  expect(resized.x).toBe(snapped.x); expect(resized.y).toBe(snapped.y);
  await page.screenshot({ path: '/tmp/triadichrome-detail-part-corner.png' });
  const smaller = (await grip.boundingBox())!;
  await page.mouse.move(smaller.x + smaller.width / 2, smaller.y + smaller.height / 2); await page.mouse.down();
  await page.mouse.move(smaller.x - 130, smaller.y - 100, { steps: 12 }); await page.mouse.up();
  await settleMotion(app.locator('body'));
  expect((await rectangles(app))[0]!.width).toBe(64);
  expect((await rectangles(app))[0]!.height).toBe(64);
});

test('ドラッグのEscと領域外ドロップは配置を変更せず、自動スクロールで画面外へ運べる', async ({ app, page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await openEditor(app); await dropPart(page, app, 200, 140);
  const before = await rectangles(app);
  const part = (await app.locator('.detail-part').boundingBox())!;
  await page.mouse.move(part.x + 30, part.y + 30); await page.mouse.down();
  await page.mouse.move(part.x + 120, part.y + 120, { steps: 8 });
  await expect(app.locator('.detail-part-destination')).toBeVisible();
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(app.locator('.detail-part-destination')).toHaveCount(0);
  await settleMotion(app.locator('body')); expect(await rectangles(app)).toEqual(before);
  const source = (await app.getByRole('button', { name: 'テキストパーツを追加', exact: true }).boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 20); await page.mouse.down();
  await page.mouse.move(part.x + 120, part.y + 120, { steps: 8 });
  await expect(app.locator('.detail-part-destination')).toBeVisible();
  await expect(app.locator('.detail-part-destination')).toHaveCSS('width', '160px');
  await expect(app.locator('.detail-part-destination')).toHaveCSS('height', '96px');
  await page.mouse.move(20, 20, { steps: 8 });
  await expect(app.locator('.detail-part-destination')).toHaveCount(0);
  await page.mouse.up();
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

test('テキストはダブルクリックで編集し、改行・外側クリック・Esc・長文スクロールと一時保持を扱う', async ({ app, page }, info) => {
  await openEditor(app); await dropPart(page, app, 210, 160);
  const part = app.locator('.detail-part').first();
  const view = part.getByRole('button', { name: 'パーツ 1のテキストを編集', exact: true });
  await expect(view).toHaveText('ダブルクリックで入力');
  await expect(part.getByRole('textbox')).toHaveCount(0);
  const before = await rectangles(app);
  await view.dblclick();
  const input = part.getByRole('textbox', { name: 'パーツ 1の説明文', exact: true });
  await expect(input).toBeFocused();
  await input.fill('人件費の算定根拠');
  await input.press('End'); await input.press('Enter');
  await input.pressSequentially('単価 × 人数 × 月数');
  await input.press('ArrowLeft'); await input.press('Backspace');
  await expect(app.locator('.detail-part')).toHaveCount(1);
  expect(await rectangles(app)).toEqual(before);
  await input.fill('人件費の算定根拠\n単価 × 人数 × 月数');
  await app.getByRole('heading', { name: 'パーツ配置', exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(view).toHaveText('人件費の算定根拠\n単価 × 人数 × 月数');
  await page.screenshot({ path: `/tmp/triadichrome-text-part-plain-${info.project.name}.png` });
  await view.dblclick(); await input.fill('Escでも入力を保持'); await input.press('Escape');
  await expect(input).toHaveCount(0); await expect(view).toHaveText('Escでも入力を保持');
  await view.press('Enter'); await expect(input).toBeFocused();
  const longText = Array.from({ length: 30 }, (_, i) => `${i + 1}行目の説明文 <b>装飾なし</b>`).join('\n');
  await input.fill(longText);
  expect(await input.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await input.press('Escape');
  expect(await view.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await view.hover(); await page.mouse.wheel(0, 160);
  await expect.poll(() => view.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(await rectangles(app)).toEqual(before);
  await expect(view.locator('b')).toHaveCount(0);
  await page.screenshot({ path: `/tmp/triadichrome-text-part-${info.project.name}.png` });
  await part.press('ArrowRight'); await settleMotion(app.locator('body'));
  await expect(view).toHaveText(longText);
  await view.press('Enter'); await input.fill('画面移動でも入力を保持');
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: 'パーツ配置を開く', exact: true }).click();
  await expect(view).toHaveText('画面移動でも入力を保持');
  await view.dblclick(); await input.fill(''); await input.press('Escape');
  await expect(view).toHaveText('ダブルクリックで入力');
});

test('空の3×3表を編集し、改行・行列操作・削除確認・幅の追従・画面往復を扱う', async ({ app, page }, info) => {
  await openEditor(app);
  const source = app.getByRole('button', { name: 'テーブルパーツを追加', exact: true });
  await source.press('Enter');
  const part = app.locator('.detail-part').first();
  const table = part.getByRole('table', { name: 'パーツ 1の表', exact: true });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('cell')).toHaveCount(9);
  await expect(part.getByRole('textbox')).toHaveCount(0);
  const before = await rectangles(app);
  await part.getByRole('group', { name: 'パーツ 1のテーブル', exact: true }).dblclick();
  const cell = (r: number, c: number) => part.getByRole('textbox', { name: `${r}行${c}列`, exact: true });
  await expect(cell(1, 1)).toBeFocused();
  await cell(1, 1).fill('項目'); await cell(1, 1).press('Enter');
  await expect(cell(2, 1)).toBeFocused();
  await cell(2, 1).fill('説明'); await cell(2, 1).press('End'); await cell(2, 1).press('Shift+Enter');
  await cell(2, 1).pressSequentially('続き'); await expect(cell(2, 1)).toHaveValue('説明\n続き');
  await cell(2, 1).press('Tab'); await expect(cell(2, 2)).toBeFocused();
  await page.screenshot({ path: `/tmp/triadichrome-table-part-edit-${info.project.name}.png` });
  expect(await rectangles(app)).toEqual(before);
  await part.getByRole('button', { name: '行を追加', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(4); await expect(cell(3, 2)).toBeFocused();
  await part.getByRole('button', { name: '行を削除', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(3); await expect(app.getByRole('alertdialog')).toHaveCount(0);
  await cell(1, 1).click(); await part.getByRole('button', { name: '行を削除', exact: true }).click();
  const confirm = app.getByRole('alertdialog', { name: '行を削除', exact: true });
  await expect(confirm).toBeVisible(); await confirm.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(cell(1, 1)).toHaveValue('項目');
  await part.getByRole('button', { name: '列を追加', exact: true }).click();
  await expect(table.getByRole('cell')).toHaveCount(12);
  await part.getByRole('button', { name: '列を削除', exact: true }).click();
  await expect(table.getByRole('cell')).toHaveCount(9);
  await cell(1, 1).click(); await part.getByRole('button', { name: '行を削除', exact: true }).click();
  await confirm.getByRole('button', { name: '削除する', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(2); await expect(cell(1, 1)).toHaveValue('説明\n続き');
  await cell(1, 1).press('Escape'); await expect(part.getByRole('textbox')).toHaveCount(0);
  const oldWidths = await table.getByRole('row').first().getByRole('cell').evaluateAll(nodes => nodes.map(e => e.getBoundingClientRect().width));
  await part.locator('.detail-part-grip').press('ArrowRight'); await settleMotion(app.locator('body'));
  const newWidths = await table.getByRole('row').first().getByRole('cell').evaluateAll(nodes => nodes.map(e => e.getBoundingClientRect().width));
  expect(newWidths[0]).toBeGreaterThan(oldWidths[0]!);
  expect(Math.max(...newWidths) - Math.min(...newWidths)).toBeLessThan(1);
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: 'パーツ配置を開く', exact: true }).click();
  await expect(table).toContainText('説明');
  await page.screenshot({ path: `/tmp/triadichrome-table-part-${info.project.name}.png` });
  await part.getByRole('group', { name: 'パーツ 1のテーブル', exact: true }).dblclick();
  await cell(1, 1).fill('外をクリックして確定');
  await app.getByRole('heading', { name: 'パーツ配置', exact: true }).click();
  await expect(part.getByRole('textbox')).toHaveCount(0);
  await expect(table).toContainText('外をクリックして確定');
  for (let i = 0; i < 17; i++) await part.locator('.detail-part-grip').press('ArrowLeft');
  await settleMotion(app.locator('body'));
  await part.getByRole('group', { name: 'パーツ 1のテーブル', exact: true }).dblclick();
  const toolbar = part.getByRole('toolbar');
  expect(await toolbar.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
  expect(await part.locator('.detail-table-scroll').evaluate(e => e.clientHeight)).toBeGreaterThan(0);
});

test('表の貼り付けは起点から行列を拡張し、長い表は内部でスクロールして保持する', async ({ app, page }) => {
  await openEditor(app);
  // Add the table through the same pointer path as the text pool.
  const source = (await app.getByRole('button', { name: 'テーブルパーツを追加', exact: true }).boundingBox())!;
  const area = (await app.locator('.detail-canvas-viewport').boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
  await page.mouse.move(area.x + Math.min(230, area.width / 2), area.y + 160, { steps: 12 }); await page.mouse.up();
  await settleMotion(app.locator('body'));
  const part = app.locator('.detail-part').first(), table = part.getByRole('table');
  await part.getByRole('group', { name: 'パーツ 1のテーブル', exact: true }).dblclick();
  const start = part.getByRole('textbox', { name: '2行2列', exact: true });
  await start.fill('保持'); await start.click();
  await start.evaluate(node => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '項目\t単価\t数量\r\n"改行\n説明"\t001\t=1+1\r\n');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(table.getByRole('row')).toHaveCount(3); await expect(table.getByRole('cell')).toHaveCount(12);
  await expect(part.getByRole('textbox', { name: '3行2列', exact: true })).toHaveValue('改行\n説明');
  await expect(part.getByRole('textbox', { name: '3行3列', exact: true })).toHaveValue('001');
  await expect(part.getByRole('textbox', { name: '3行4列', exact: true })).toHaveValue('=1+1');
  await start.evaluate(node => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', Array.from({ length: 25 }, (_, i) => `${i + 1}\t説明`).join('\n'));
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(table.getByRole('row')).toHaveCount(26);
  await start.press('Escape');
  expect(await part.locator('.detail-table-scroll').evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await part.locator('.detail-table-scroll').hover(); await page.mouse.wheel(0, 200);
  await expect.poll(() => part.locator('.detail-table-scroll').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  await part.press('ArrowRight'); await settleMotion(app.locator('body'));
  await expect(table.getByRole('row')).toHaveCount(26);
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: 'パーツ配置を開く', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(26);
});
