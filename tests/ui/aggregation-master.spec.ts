import { test, expect, settleMotion } from './fixtures';

test('縦書き集計名が表示範囲の中央へ追従し、行とL字を再構築しない', async ({ app }) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  await settleMotion(app.locator('body'));
  const density = await app.locator('.aggregation-layout-table').evaluate(node => {
    const table = node as HTMLTableElement;
    const region = table.closest('.aggregation-grid-scroll')!;
    const sign = table.querySelector('.master-sign-selector')!.getBoundingClientRect();
    return {
      width: table.getBoundingClientRect().width,
      viewport: region.getBoundingClientRect().width,
      rows: [...table.tBodies[0]!.rows].map(row => row.getBoundingClientRect().height),
      sign: [sign.width, sign.height],
    };
  });
  expect(density.width).toBeLessThanOrEqual(542);
  expect(density.viewport).toBeLessThanOrEqual(542);
  expect(density.rows.every(height => height === 31)).toBe(true);
  expect(density.sign).toEqual([64, 30]);
  const region = app.getByRole('region', { name: '集計の構成', exact: true });
  const name = app.getByRole('button', { name: '経常利益の範囲', exact: true }).locator('.aggregation-label-text');
  await expect(name).toBeVisible();
  const paths = await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  const rows = await app.locator('.aggregation-layout-table tbody tr').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const checkPosition = () => name.evaluate(node => {
    const region = node.closest('.aggregation-grid-scroll')!, header = region.querySelector('thead')!;
    const range = node.parentElement!.getBoundingClientRect(), label = node.getBoundingClientRect(), viewport = region.getBoundingClientRect();
    const top = Math.max(range.top, viewport.top + header.getBoundingClientRect().height), bottom = Math.min(range.bottom, viewport.bottom);
    return { distance: Math.abs((label.top + label.bottom) / 2 - (top + bottom) / 2), inside: label.top >= range.top - 1 && label.bottom <= range.bottom + 1 };
  });
  await expect.poll(async () => (await checkPosition()).distance).toBeLessThanOrEqual(1);
  await region.evaluate(node => { node.scrollTop = 600; });
  await expect.poll(async () => (await checkPosition()).distance).toBeLessThanOrEqual(1);
  expect((await checkPosition()).inside).toBe(true);
  expect(await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(paths);
  expect(await app.locator('.aggregation-layout-table tbody tr').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(rows);
  await region.evaluate(node => { node.scrollTop = 0; });
  const handle = app.getByRole('button', { name: '売上高を移動', exact: true });
  await handle.click();
  await region.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    node.dispatchEvent(new DragEvent('dragover', { bubbles: true, clientX: bounds.left + 100, clientY: bounds.bottom - 8, dataTransfer: new DataTransfer() }));
  });
  await expect.poll(() => region.evaluate(node => node.scrollTop)).toBeGreaterThan(10);
  await handle.press('Escape');
  const stopped = await region.evaluate(node => node.scrollTop);
  await region.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await region.evaluate(node => node.scrollTop)).toBe(stopped);
});

test('集計マスタのL字・所属変更・加減・登録を総原価表へ反映する', async ({ app }, testInfo) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  if (testInfo.project.name === 'narrow') await app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).first().click();
  const table = app.getByRole('table', { name: '集計マスタ', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(72);
  await expect(table.getByRole('columnheader')).toHaveText(['集計の範囲', '移動', '科目・集計', '加減']);
  const originalOrder = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getAttribute('data-row')));
  await expect(app.getByRole('button', { name: '社外売上小計の範囲', exact: true })).toBeVisible();
  const handle = app.getByRole('button', { name: '本支店売上高を移動', exact: true });
  await handle.dragTo(table.getByRole('row').filter({has:app.getByRole('button',{name:'社外売上小計を移動',exact:true})}).getByRole('rowheader'), { targetPosition: { x: 8, y: 20 } });
  await expect(app.getByRole('button', { name: '本支店売上高を移動', exact: true })).toBeEnabled();
  const moved = table.getByRole('row').filter({ has: app.getByRole('button', { name: '本支店売上高を移動', exact: true }) });
  await moved.getByRole('button', { name: '減算', exact: true }).click();
  await expect(moved.getByRole('button', { name: '減算', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(moved.getByRole('button', { name: '減算', exact: true })).toBeEnabled();
  const changedOrder = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getAttribute('data-row')));
  expect(changedOrder).not.toEqual(originalOrder);
  const movedIndex = changedOrder.indexOf(await moved.getAttribute('data-row'));
  await expect(table.locator('tbody tr').nth(movedIndex + 1)).toContainText('社外売上小計');
  await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '集計名', exact: true }).fill('新しい集計');
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(73);
  await expect(table.locator('tbody tr').last()).toContainText('新しい集計');
  if (testInfo.project.name === 'narrow') await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: '総原価表', exact: true }).click();
  await settleMotion(app.locator('body'));
  await expect(app.locator('.cost-table .cost-data-row').nth(movedIndex)).toContainText('本支店売上高');
  await expect(app.locator('.cost-table')).toContainText('新しい集計');
});

test('集計の保存失敗で入力と所属・並び順・符号を保護する', async ({ app, page }) => {
  await page.locator('#dataset').selectOption('defaults');
  await page.locator('#scenario').selectOption('save-failure');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  const table = app.getByRole('table', { name: '集計マスタ', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(72);
  const original = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => row.textContent));
  await app.getByRole('button', { name: '会議費を移動', exact: true }).click();
  await app.getByRole('button', { name: '社外売上小計の範囲へ移動', exact: true }).click();
  await expect(app.getByRole('alert')).toContainText('テスト用の保存失敗');
  expect(await table.locator('tbody tr').evaluateAll(rows => rows.map(row => row.textContent))).toEqual(original);
  await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '集計名', exact: true }).fill('保存待ち');
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(app.getByRole('alert')).toContainText('テスト用の保存失敗');
  await expect(app.getByRole('textbox', { name: '集計名', exact: true })).toHaveValue('保存待ち');
  await expect(table.locator('tbody tr')).toHaveCount(72);
});
