import { test, expect, openInitiativeEntry, selectAccount, selectClassification, settleMotion } from './fixtures';
import type { Locator } from '@playwright/test';

async function transfer(cell: Locator, type: 'cut' | 'copy') {
  return cell.evaluate((node, type) => {
    const clipboardData = new DataTransfer();
    node.dispatchEvent(new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData }));
    return { text: clipboardData.getData('text/plain'), token: clipboardData.getData('application/x-triadic-grid-cut') };
  }, type);
}
async function paste(cell: Locator, data: { text: string; token?: string }) {
  await cell.evaluate((node, data) => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', data.text);
    if (data.token) clipboardData.setData('application/x-triadic-grid-cut', data.token);
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }, data);
}

for (const detail of [false, true]) test(`${detail ? '施策詳細' : '施策入力'}の切り取りは元値を残し、重なる移動と失敗・取消を扱う`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  if (detail) {
    await app.getByRole('button', { name: '施策を検索', exact: true }).click();
    await app.getByRole('searchbox').fill('確定予算の手修正');
    await app.getByRole('searchbox').press('Enter');
  } else {
    await openInitiativeEntry(app);
    await selectAccount(app.getByRole('combobox', { name: '1行目の勘定科目', exact: true }), '1');
  }
  for (const kind of ['一次予算', '確定予算']) {
    await app.getByRole('tab', { name: kind, exact: true }).click();
    const cell = (column: number) => app.locator(`.initiative-amount-table input[data-row="0"][data-column="${column}"]`);
    await cell(0).click(); await paste(cell(0), { text: '100.001\t200\t300\t0' });
    await expect(cell(0)).toBeEnabled();
    if (detail) {
      await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: 'Home', exact: true }).click();
      await app.getByRole('button', { name: '施策を検索', exact: true }).click();
      await app.getByRole('searchbox').fill('確定予算の手修正'); await app.getByRole('searchbox').press('Enter');
      await app.getByRole('tab', { name: kind, exact: true }).click();
      await expect(cell(0)).toHaveValue('100.001');
    }
    await cell(0).click(); await cell(0).press('Shift+ArrowRight'); await cell(1).press('Shift+ArrowRight');
    const clipboard = await transfer(cell(2), 'cut');
    expect(clipboard.text).toBe('100.001\t200\t300'); expect(clipboard.token).not.toBe('');
    await expect(cell(0)).toHaveValue('100.001');
    await expect(app.locator('[data-grid-cut]')).toHaveCount(3);
    await cell(11).click(); await paste(cell(11), clipboard);
    await expect(cell(0)).toHaveValue('100.001');
    await expect(app.locator('[data-grid-cut]')).toHaveCount(3);
    await cell(1).click(); await paste(cell(1), clipboard);
    await expect(cell(0)).toHaveValue('0'); await expect(cell(1)).toHaveValue('100.001');
    await expect(cell(2)).toHaveValue('200'); await expect(cell(3)).toHaveValue('300');
    await expect(app.locator('[data-grid-cut]')).toHaveCount(0);
    if (detail && kind === '一次予算') {
      const undo = app.getByRole('button', { name: '操作を取り消す', exact: true });
      await expect(undo).toBeEnabled(); await undo.click();
      await expect(cell(0)).toHaveValue('100.001'); await expect(cell(1)).toHaveValue('200');
      const redo = app.getByRole('button', { name: '操作をやり直す', exact: true });
      await expect(redo).toBeEnabled(); await redo.click();
      await expect(cell(0)).toHaveValue('0'); await expect(cell(1)).toHaveValue('100.001');
    }
    await expect(cell(1)).toBeEnabled(); await cell(1).click();
    const canceled = await transfer(cell(1), 'cut'); await cell(1).press('Escape');
    await expect(app.locator('[data-grid-cut]')).toHaveCount(0);
    await cell(4).click(); await paste(cell(4), canceled);
    await expect(cell(1)).toHaveValue('100.001'); await expect(cell(4)).toHaveValue('100.001');
  }
});

test('前年入力の切り取りも重なる範囲を一度に移動し元セルを0にする', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '前年入力', exact: true }).click();
  await selectClassification(app.getByRole('combobox', { name: '部署名', exact: true }), '部署A');
  await selectClassification(app.getByRole('combobox', { name: '業種名', exact: true }), '直営自動車');
  const cell = (column: number) => app.locator(`.previous-grid input[data-row="0"][data-column="${column}"]`);
  await cell(0).focus(); await paste(cell(0), { text: '100.001\t200\t300\t0' });
  await cell(0).focus(); await cell(0).press('Shift+ArrowRight'); await cell(1).press('Shift+ArrowRight');
  const clipboard = await transfer(cell(2), 'cut');
  await expect(cell(0)).toHaveValue('100.001');
  await cell(1).focus(); await paste(cell(1), clipboard);
  await expect(cell(0)).toHaveValue('0'); await expect(cell(1)).toHaveValue('100.001');
  await expect(cell(2)).toHaveValue('200'); await expect(cell(3)).toHaveValue('300');
  await expect(app.locator('[data-grid-cut]')).toHaveCount(0);
});

for (const name of ['総原価表', '展開表', '施策一覧']) test(`${name}は金額範囲を表示どおりにコピーし、ドラッグ後も画面を開かない`, async ({ page, app }, info) => {
  await page.goto('/tests/ui/preview.html?data=signed-categories-large');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  await settleMotion(app.locator('body'));
  const table = app.getByRole('table', { name, exact: true }), region = table.locator('..');
  const first = table.locator('[data-copy-row="0"][data-copy-column="0"]');
  await expect(first).toBeVisible();
  await first.dispatchEvent('pointerdown', { button: 0, buttons: 1, shiftKey: true });
  await region.press('Shift+ArrowRight'); await region.press('Shift+ArrowRight');
  const expected = await table.locator('[data-copy-row="0"][data-range-selected="true"]').allTextContents();
  const copied = await transfer(region, 'copy');
  expect(copied.text).toBe(expected.join('\t'));
  expect(expected).toHaveLength(3);
  await region.press('Escape');
  await expect(table.locator('[data-range-selected="true"]')).toHaveCount(0);
  if (info.project.name === 'desktop') {
    await page.mouse.move(1100, 150);
    await settleMotion(app.locator('body'));
    await region.evaluate(node => { node.scrollTop = 0; node.scrollLeft = 0; });
    const second = table.locator('[data-copy-row="0"][data-copy-column="1"]');
    const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 }); await page.mouse.up();
    await expect(table.locator('[data-range-selected="true"]')).toHaveCount(2);
    await expect(app.getByRole('dialog')).toHaveCount(0);
    await region.press('Escape');
    if (name === '総原価表') {
      await first.getByRole('button').click();
      await expect(app.getByRole('dialog')).toBeVisible();
      await app.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
    }
  }
  // A rectangle can span windowed-out rows without reading missing DOM cells.
  if (name === '施策一覧') {
    await first.dispatchEvent('pointerdown', { button: 0, buttons: 1, shiftKey: true });
    await region.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const last = table.locator('tfoot [data-copy-column="0"]');
    await last.dispatchEvent('pointerdown', { button: 0, buttons: 1, shiftKey: true });
    const lastRow = Number(await last.getAttribute('data-copy-row'));
    const data = await transfer(region, 'copy');
    expect(data.text.split('\n')).toHaveLength(lastRow + 1);
    expect(lastRow).toBeGreaterThan(200);
  }
});

for (const name of ['総原価表', '展開表', '施策一覧']) test(`${name}の矢印選択は上下左右の固定領域に隠れない`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=signed-categories-large');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  await settleMotion(app.locator('body'));
  const table = app.getByRole('table', { name, exact: true }), region = table.locator('..');
  const cell = (row: number, column: number) => table.locator(`[data-copy-row="${row}"][data-copy-column="${column}"]`);
  const uncovered = async (target: Locator) => {
    await expect(target).toHaveAttribute('data-range-selected', 'true');
    await expect.poll(() => target.evaluate(node => {
      const box = node.getBoundingClientRect();
      return [[box.left + 2, box.top + 2], [box.right - 2, box.bottom - 2]].every(([x, y]) => {
        const hit = node.ownerDocument.elementFromPoint(x!, y!);
        return hit === node || !!hit && node.contains(hit);
      });
    })).toBe(true);
  };
  await cell(0, 0).dispatchEvent('pointerdown', { button: 0, buttons: 1, shiftKey: true });
  for (let i = 0; i < 45; i++) await region.press('Shift+ArrowDown');
  await uncovered(cell(45, 0)); // Includes the lower sticky total boundary.
  expect((await transfer(region, 'copy')).text.split('\n')).toHaveLength(46);
  for (let i = 0; i < 12; i++) await region.press('ArrowUp');
  await uncovered(cell(33, 0));
  for (let i = 0; i < 18; i++) await region.press('ArrowRight');
  for (let i = 0; i < 12; i++) await region.press('ArrowLeft');
  await uncovered(cell(33, 6));
  expect((await transfer(region, 'copy')).text).toBe(await cell(33, 6).textContent());
  await expect(app.getByRole('dialog')).toHaveCount(0);
});

for (const name of ['総原価表', '展開表', '施策一覧']) test(`${name}のコピーはキーボードから開始・解除・再開始でき選択を通知する`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=signed-categories-large');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  const table = app.getByRole('table', { name, exact: true }), region = table.locator('..');
  // Enter the region with Tab from the preceding control, without selecting an amount by pointer.
  await region.focus(); await region.press('Shift+Tab'); await page.keyboard.press('Tab');
  await expect(region).toBeFocused();
  await expect(region).toHaveAttribute('aria-describedby', /instructions/);
  await expect(region.locator('[id$="-instructions"]')).toContainText('矢印キーで先頭の金額');
  const status = region.locator('span[role="status"]');
  await region.press('ArrowDown');
  const first = table.locator('[data-copy-row="0"][data-copy-column="0"]');
  await expect(first).toHaveAttribute('data-range-selected', 'true');
  await expect(status).toContainText('現在 1行目・1列目');
  await expect(status).toContainText('1行×1列、1セル');
  expect((await transfer(region, 'copy')).text).toBe(await first.textContent());
  await region.press('Shift+ArrowRight'); await region.press('Shift+ArrowDown');
  await expect(status).toContainText('2行×2列、4セル');
  await expect(status).toContainText('範囲 1行目・1列目');
  expect((await transfer(region, 'copy')).text.split('\n').map(row => row.split('\t').length)).toEqual([2, 2]);
  await region.press('Escape');
  await expect(status).toHaveText('選択なし。');
  await expect(table.locator('[data-range-selected]')).toHaveCount(0);
  await region.press('ArrowRight');
  await expect(first).toHaveAttribute('data-range-selected', 'true');
  await region.press('Tab');
  await expect(region).not.toBeFocused();
  if (name === '総原価表') {
    await first.getByRole('button').focus(); await first.getByRole('button').press('Enter');
    await expect(app.getByRole('dialog')).toBeVisible();
  } else {
    const sort = table.locator('thead').getByRole('button').first();
    await sort.focus(); await sort.press('Enter');
    await expect(status).toHaveText('選択なし。');
    await region.focus(); await region.press('ArrowDown');
    await expect(status).toContainText('現在 1行目・1列目');
    // Arrow keys on a header must not move the amount selection.
    const before = await status.textContent();
    await sort.focus(); await sort.press('ArrowRight');
    await expect(status).toHaveText(before!);
    const filter = table.getByRole('button', { name: '施策名を絞り込む', exact: true });
    await filter.focus(); await filter.press('Enter');
    const panel = app.getByRole('dialog', { name: '施策名', exact: true });
    await panel.getByRole('searchbox', { name: '含む文字', exact: true }).fill('存在しない施策');
    await panel.getByRole('button', { name: '適用', exact: true }).press('Enter');
    await expect(status).toHaveText('選択なし。');
    await region.focus(); await region.press('ArrowDown');
    await expect(status).toContainText('現在 1行目・1列目');
    const kind = name === '施策一覧'
      ? app.getByRole('group', { name: '表示種別', exact: true }).getByRole('button', { name: '一次予算', exact: true })
      : app.getByRole('checkbox', { name: '前年見込を基準にした確定予算', exact: true });
    await kind.focus(); await kind.press('Space');
    await expect(status).toHaveText('選択なし。');
    await region.focus(); await region.press('ArrowDown');
    await expect(status).toContainText('現在 1行目・1列目');
  }
});
