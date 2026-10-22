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

test('プールからテキストパーツを繰り返し置き、周囲の位置保持・ホバー・削除・画面往復を確認する', async ({ app, page }, info) => {
  await openEditor(app);
  await dropPart(page, app);
  await expect(app.locator('.detail-part')).toHaveCount(1);
  await expect(app.locator('.detail-part').first()).toHaveText('ダブルクリックで入力×');
  await expect(app.getByRole('button', { name: 'テキストパーツを追加', exact: true })).toBeVisible();
  const fixed = (await rectangles(app))[0];
  await dropPart(page, app);
  await expect(app.locator('.detail-part')).toHaveCount(2);
  expect((await rectangles(app))[0]).toEqual(fixed);
  const rects = await rectangles(app), [a, b] = rects;
  expect(a!.x + a!.width <= b!.x || b!.x + b!.width <= a!.x || a!.y + a!.height <= b!.y || b!.y + b!.height <= a!.y).toBe(true);
  expect(a!.width).toBe(168); expect(a!.height).toBe(96);
  for (const rect of rects) { expect(rect.x % 24).toBe(0); expect(rect.y % 24).toBe(0); }
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
    await page.screenshot({ path: info.outputPath('detail-parts.png') });
  } else await page.screenshot({ path: info.outputPath('detail-parts.png') });
});

test('移動中の吸着と確定時のスナップ、右下だけの斜め伸縮を確認する', async ({ app, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'ポインターの位置と斜め伸縮は通常幅、狭幅は追加・スクロール・削除を別テストで確認');
  await openEditor(app); await dropPart(page, app, 210, 160);
  const canvas = app.locator('.detail-canvas');
  await expect(canvas).toHaveCSS('background-size', '24px 24px');
  expect(await canvas.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('radial-gradient');
  const before = (await rectangles(app))[0]!;
  const partBox = (await app.locator('.detail-part').boundingBox())!;
  await page.mouse.move(partBox.x + 30, partBox.y + 30); await page.mouse.down();
  const destination = app.locator('.detail-part-destination');
  for (const dx of [7, 9, 7, 9]) {
    await page.mouse.move(partBox.x + 30 + dx, partBox.y + 30, { steps: 2 });
    await expect.poll(() => destination.evaluate(e => new DOMMatrix((e as HTMLElement).style.transform).m41)).toBe(before.x);
  }
  await page.mouse.move(partBox.x + 49, partBox.y + 51, { steps: 12 });
  const raw = { x: before.x + 19, y: before.y + 21 };
  const target = { x: Math.round(raw.x / 24) * 24, y: Math.round(raw.y / 24) * 24 };
  await expect.poll(async () => Math.abs((await rectangles(app))[0]!.x - target.x)).toBeLessThan(Math.abs(raw.x - target.x));
  const live = (await rectangles(app))[0]!;
  expect(live.x % 24).not.toBe(0); expect(live.y % 24).not.toBe(0);
  await expect(destination).toBeVisible();
  expect(await destination.evaluate(e => {
    const matrix = new DOMMatrix((e as HTMLElement).style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  })).toEqual(target);
  await expect(destination).toHaveCSS('background-color', 'rgba(57, 121, 230, 0.14)');
  await expect(destination).toHaveCSS('pointer-events', 'none');
  await expect(destination).toHaveCSS('transition-duration', '0.1s');
  // Return across the nearest-point boundary without changing the indicated landing position.
  await page.mouse.move(partBox.x + 43, partBox.y + 51, { steps: 4 });
  await expect.poll(() => destination.evaluate(e => new DOMMatrix((e as HTMLElement).style.transform).m41)).toBe(target.x);
  await page.screenshot({ path: info.outputPath('detail-destination.png') });
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
  await expect.poll(async () => (await rectangles(app))[0]!.width % 24).not.toBe(0);
  await expect.poll(async () => (await rectangles(app))[0]!.height % 24).not.toBe(0);
  await page.mouse.up();
  await expect(app.locator('.detail-part')).toHaveCSS('transition-duration', '0.24s, 0.24s, 0.24s, 0.16s');
  await settleMotion(app.locator('body'));
  const resized = (await rectangles(app))[0]!;
  expect(resized.width).toBe(192); expect(resized.height).toBe(144);
  expect(resized.x).toBe(snapped.x); expect(resized.y).toBe(snapped.y);
  await page.screenshot({ path: info.outputPath('detail-part-corner.png') });
  const smaller = (await grip.boundingBox())!;
  await page.mouse.move(smaller.x + smaller.width / 2, smaller.y + smaller.height / 2); await page.mouse.down();
  await page.mouse.move(smaller.x - 180, smaller.y - 130, { steps: 12 }); await page.mouse.up();
  await settleMotion(app.locator('body'));
  expect((await rectangles(app))[0]!.width).toBe(72);
  expect((await rectangles(app))[0]!.height).toBe(72);
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
  await expect(app.locator('.detail-part-destination')).toHaveCSS('width', '168px');
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
  await page.screenshot({ path: info.outputPath('text-part-plain.png') });
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
  await page.screenshot({ path: info.outputPath('text-part.png') });
  await part.press('ArrowRight'); await settleMotion(app.locator('body'));
  await expect(view).toHaveText(longText);
  await view.press('Enter'); await input.fill('画面移動でも入力を保持');
  await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  await app.getByRole('button', { name: 'パーツ配置を開く', exact: true }).click();
  await expect(view).toHaveText('画面移動でも入力を保持');
  await view.dblclick(); await input.fill(''); await input.press('Escape');
  await expect(view).toHaveText('ダブルクリックで入力');
});

for (const horizontal of [true, false]) {
  const direction = horizontal ? '横向き' : '縦向き';
  test(`${direction}12か月は項目編集・削除確認・貼り付け制限・見出し固定と保持を扱う`, async ({ app, page }, info) => {
    await openEditor(app);
    const source = app.getByRole('button', { name: `${direction}12か月パーツを追加`, exact: true });
    await expect(app.getByRole('button', { name: 'テーブルパーツを追加', exact: true })).toHaveCount(0);
    await source.press('Enter');
    const part = app.locator('.detail-part').first(), table = part.getByRole('table');
    const wrapper = part.getByRole('group', { name: `パーツ 1の${direction}12か月`, exact: true });
    const months = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];
    const monthHeaders = horizontal ? table.locator('thead th').filter({ hasNotText: '項目' }) : table.locator('tbody th');
    expect(await monthHeaders.allTextContents()).toEqual(months);
    const before = await rectangles(app);
    const fits = () => part.locator('.detail-table-scroll').evaluate(e => ({ x: e.scrollWidth <= e.clientWidth, y: e.scrollHeight <= e.clientHeight }));
    expect(await fits()).toEqual({ x: true, y: true });
    const grip = part.getByRole('button', { name: 'パーツ 1の右下でサイズ変更', exact: true });
    await grip.press('ArrowLeft'); await grip.press('ArrowUp');
    expect(await rectangles(app)).toEqual(before);
    await table.locator('th').first().dblclick();
    const name = (i: number) => part.getByRole('textbox', { name: `項目 ${i}の名前`, exact: true });
    const cell = (i: number, month: string) => part.getByRole('textbox', { name: `項目 ${i}の${month}`, exact: true });
    await expect(name(1)).toBeFocused();
    expect(await fits()).toEqual({ x: true, y: true });
    await name(1).fill('人数'); await name(2).fill('単価');
    await cell(1, '4月').fill('001');
    for (const boundary of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
      const accepted = await cell(1, '4月').evaluate((node, boundary) => node.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...boundary,
      })), boundary);
      expect(accepted).toBe(true);
      await expect(cell(1, '4月')).toBeFocused();
      await expect(cell(1, '4月')).toHaveValue('001');
    }
    await cell(1, '4月').press('Enter');
    await expect(horizontal ? cell(2, '4月') : cell(1, '5月')).toBeFocused();
    await cell(1, '4月').press('End'); await cell(1, '4月').press('Shift+Enter');
    await cell(1, '4月').pressSequentially('説明'); await expect(cell(1, '4月')).toHaveValue('001\n説明');
    expect(await rectangles(app)).toEqual(before);
    await page.screenshot({ path: info.outputPath(`monthly-${horizontal ? 'horizontal' : 'vertical'}.png`) });
    await name(1).click(); await part.getByRole('button', { name: '項目を追加', exact: true }).click();
    await expect(name(2)).toBeFocused(); await expect(name(3)).toHaveValue('単価');
    await part.getByRole('button', { name: '項目を削除', exact: true }).click();
    await expect(app.getByRole('alertdialog')).toHaveCount(0); await expect(name(2)).toHaveValue('単価');
    await name(1).click(); await part.getByRole('button', { name: '項目を削除', exact: true }).click();
    const dialog = app.getByRole('alertdialog', { name: '項目を削除', exact: true });
    await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(name(1)).toHaveValue('人数');
    const paste = async (target: ReturnType<typeof cell>, text: string) => {
      await target.evaluate((node, value) => {
        const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', value);
        node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
      }, text);
    };
    await paste(cell(1, '3月'), horizontal ? '超過\t超過' : '超過\n超過');
    await expect(part.getByRole('alert')).toContainText('12か月の範囲を超える');
    await expect(cell(1, '3月')).toHaveValue(''); await expect(cell(1, '4月')).toHaveValue('001\n説明');
    const pasted = horizontal ? Array.from({ length: 10 }, (_, i) => `${i}\t001`).join('\n')
      : Array.from({ length: 12 }, (_, m) => `${m}\t001\t=1+1\t追加`).join('\n');
    await paste(cell(3, '4月'), pasted);
    await expect(part.getByRole('alert')).toHaveCount(0);
    await expect(cell(4, '4月')).toHaveValue(horizontal ? '1' : '001');
    if (!horizontal) await cell(4, '4月').fill('長文\n'.repeat(12));
    await app.getByRole('heading', { name: 'パーツ配置', exact: true }).click();
    await expect(part.getByRole('textbox')).toHaveCount(0);
    const scroll = part.locator('.detail-table-scroll');
    await table.locator('th').first().hover(); await page.mouse.wheel(0, 100);
    await expect.poll(() => scroll.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
    expect(await scroll.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    const scrollBox = (await scroll.boundingBox())!, headerBox = (await table.locator('thead th').first().boundingBox())!;
    expect(Math.abs(headerBox.y - scrollBox.y)).toBeLessThan(2);
    expect(Math.abs(headerBox.x - scrollBox.x)).toBeLessThan(2);
    if (horizontal) {
      const rowHeaderBox = (await table.locator('tbody th').first().boundingBox())!;
      expect(Math.abs(rowHeaderBox.x - scrollBox.x)).toBeLessThan(2);
    }
    await part.press('ArrowRight'); await settleMotion(app.locator('body'));
    await app.getByRole('button', { name: '一覧に戻る', exact: true }).click();
    await app.getByRole('button', { name: 'パーツ配置を開く', exact: true }).click();
    await wrapper.press('Enter'); await expect(name(1)).toHaveValue('人数');
    await expect(cell(1, '4月')).toHaveValue('001\n説明');
    await name(1).click(); await part.getByRole('button', { name: '項目を削除', exact: true }).click();
    await dialog.getByRole('button', { name: '削除する', exact: true }).click();
    await expect(name(1)).toHaveValue('単価');
    expect(await monthHeaders.allTextContents()).toEqual(months);
  });
}


test('24px格子上で左右・上下の辺と角を共有して配置し、移動・伸縮でも隣接を保つ', async ({ app }, info) => {
  test.skip(info.project.name !== 'desktop');
  await openEditor(app);
  const source = app.getByRole('button', { name: 'テキストパーツを追加', exact: true });
  await source.press('Enter'); await source.press('Enter');
  const part = app.getByRole('group', { name: 'パーツ 2', exact: true });
  const expected = (x: number, y: number) => [
    { x: 24, y: 24, width: 168, height: 96 },
    { x, y, width: 168, height: 96 },
  ];
  expect(await rectangles(app)).toEqual(expected(24, 120)); // shared horizontal edge
  for (let i = 0; i < 7; i++) await part.press('ArrowRight');
  expect(await rectangles(app)).toEqual(expected(192, 120)); // shared corner
  for (let i = 0; i < 4; i++) await part.press('ArrowUp');
  expect(await rectangles(app)).toEqual(expected(192, 24)); // shared vertical edge
  await part.press('ArrowRight'); await part.press('ArrowLeft');
  await settleMotion(app.locator('body'));
  expect(await rectangles(app)).toEqual(expected(192, 24));
  const grip = app.getByRole('button', { name: 'パーツ 2の右下でサイズ変更', exact: true });
  await grip.press('ArrowLeft'); await grip.press('ArrowRight');
  await settleMotion(app.locator('body'));
  expect(await rectangles(app)).toEqual(expected(192, 24));
});

test('接触時だけ凹んで解放時に戻り、取消では配置を保持する', async ({ page }) => {
  await page.goto('/tests/ui/detail-contact.html');
  const first = page.getByRole('group', { name: 'パーツ 1', exact: true });
  const second = page.getByRole('group', { name: 'パーツ 2', exact: true });
  const fixed = await second.getAttribute('style');
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 28, box.y + 35); await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 35, { steps: 10 });
  await expect.poll(() => second.evaluate(node => (node as HTMLElement).style.clipPath)).toContain('polygon');
  await expect.poll(() => first.evaluate(node => new DOMMatrix((node as HTMLElement).style.transform).m41)).toBeGreaterThan(120);
  await expect(page.locator('output')).toContainText('"x":72');
  await page.mouse.up();
  await expect(page.locator('output')).toContainText('"x":120');
  await expect(second).toHaveAttribute('style', fixed!);
  await settleMotion(page.locator('body'));
  const touching = (await first.boundingBox())!;
  await page.mouse.move(touching.x + 28, touching.y + 35); await page.mouse.down();
  await page.mouse.move(touching.x + 70, touching.y + 35);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('output')).toContainText('"x":120');
  await expect(second).toHaveAttribute('style', fixed!);
});
