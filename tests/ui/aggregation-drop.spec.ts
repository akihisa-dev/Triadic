import type { FrameLocator } from '@playwright/test';
import { test, expect, settleMotion } from './fixtures';

async function openMaster(app: FrameLocator) {
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  await settleMotion(app.locator('body'));
}

async function preview(app: FrameLocator, target: string, into: boolean) {
  await app.getByRole('button', { name: '旅費を移動', exact: true }).evaluate(node => {
    node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
  });
  await app.getByRole('button', { name: target + 'を移動', exact: true }).evaluate((node, into) => {
    const row = node.closest('tr')!, bounds = row.getBoundingClientRect();
    row.dispatchEvent(new DragEvent('dragover', { bubbles: true, clientY: bounds.top + (into ? 20 : 1), dataTransfer: new DataTransfer() }));
  }, into);
  const slot = app.getByRole('row', { name: '旅費の移動先', exact: true });
  await expect(slot).toBeVisible();
  return slot;
}

test('マウスで開いた行間にドロップでき、移動先を示す仮表示が安定する', async ({ app, page }, testInfo) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await openMaster(app);
  if (testInfo.project.name === 'narrow') await app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).first().click();
  const sourceName = testInfo.project.name === 'narrow' ? '本支店売上高' : '旅費';
  const targetName = testInfo.project.name === 'narrow' ? '売上高' : '店内売上高';
  const handle = app.getByRole('button', { name: sourceName + 'を移動', exact: true });
  const target = app.getByRole('button', { name: targetName + 'を移動', exact: true }).locator('xpath=ancestor::tr');
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!, to = (await target.getByRole('rowheader').boundingBox())!;
  const rows = app.locator('tr[data-row]');
  const order = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + 30, to.y + 1, { steps: 16 });
  const slot = app.getByRole('row', { name: sourceName + 'の移動先', exact: true });
  await expect(slot).toBeVisible();
  const bounds = (await slot.locator('.aggregation-slot-content').boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + bounds.height / 2, { steps: 4 });
  await expect(slot).toBeVisible();
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(order);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/private/tmp/triadichrome-balanced-drop-final.png' });
  await page.mouse.up();
  await expect(slot).toHaveCount(0);
  await expect(handle).toBeEnabled();
  const moved = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const travelKey = await handle.locator('xpath=ancestor::tr').getAttribute('data-row');
  expect(moved.indexOf(travelKey)).toBe(moved.indexOf(await target.getAttribute('data-row')) - 1);
});

test('行間を開いた仮表示の取消とドロップを、保存順・所属・加減と区別する', async ({ app }) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await openMaster(app);
  const rows = app.locator('tr[data-row]');
  const order = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const paths = await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  const target = app.getByRole('button', { name: '店内売上高を移動', exact: true }).locator('xpath=ancestor::tr');
  const position = () => target.evaluate(node => node.getBoundingClientRect().top - node.closest('table')!.getBoundingClientRect().top);
  const targetTop = await position();
  const slot = await preview(app, '店内売上高', false);
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(order);
  expect(await position()).toBe(targetTop + 36);
  await expect(slot).toContainText('行順のみ · 所属は変更しません');
  await app.getByRole('button', { name: '旅費を移動', exact: true }).press('Escape');
  await expect(slot).toHaveCount(0);
  await expect.poll(position).toBe(targetTop);
  expect(await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(paths);

  await (await preview(app, '店内売上高', false)).dispatchEvent('drop');
  await expect(app.getByRole('button', { name: '旅費を移動', exact: true })).toBeEnabled();
  const travel = rows.filter({ has: app.getByRole('button', { name: '旅費を移動', exact: true }) });
  await expect(travel.getByRole('button', { name: '加算', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await travel.getByRole('rowheader').click();
  await expect(app.getByRole('button', { name: '管理可能費小計の範囲', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  const moved = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const travelKey = await travel.getAttribute('data-row'), targetKey = await target.getAttribute('data-row');
  expect(moved.indexOf(travelKey)).toBe(moved.indexOf(targetKey) - 1);

  await (await preview(app, '社内売上小計', true)).dispatchEvent('drop');
  await expect(app.getByRole('button', { name: '旅費を移動', exact: true })).toBeEnabled();
  await travel.getByRole('rowheader').click();
  await expect(app.getByRole('button', { name: '社内売上小計の範囲', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(travel.getByRole('button', { name: '加算', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(0);
});

test('所属変更だけが所属先のL字・縦書き名・集計行を一体に強調する', async ({ app, page }, testInfo) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await openMaster(app);
  const rows = app.locator('tr[data-row]');
  const original = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const travel = rows.filter({ has: app.getByRole('button', { name: '旅費を移動', exact: true }) });
  // A pre-existing selection must not look like a destination during ordering.
  await travel.getByRole('rowheader').click();
  const orderSlot = await preview(app, '店内売上高', false);
  await expect(orderSlot).toContainText('行順のみ · 所属は変更しません');
  await expect(orderSlot.locator('.aggregation-slot-destination')).toHaveCount(0);
  await expect(app.locator('.aggregation-trays path.is-highlighted')).toHaveCount(0);
  await expect(app.locator('.aggregation-vertical-name[aria-pressed="true"]')).toHaveCount(0);
  const orderColor = await orderSlot.locator('td').last().evaluate(node => getComputedStyle(node).backgroundColor);

  const memberSlot = await preview(app, '社内売上小計', true);
  await expect(memberSlot).toContainText('社内売上小計に所属');
  await expect(memberSlot.locator('small')).toHaveText('所属変更');
  const target = rows.filter({ has: app.getByRole('button', { name: '社内売上小計を移動', exact: true }) });
  const groupId = (await target.getAttribute('data-row'))!.split(':')[1];
  await expect.poll(() => app.locator('.aggregation-trays path.is-highlighted').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-group-id')))).toEqual([groupId, groupId]);
  const name = app.getByRole('button', { name: '社内売上小計の範囲へ移動', exact: true });
  await expect(name).toHaveAttribute('aria-pressed', 'true');
  await expect(name).toHaveCSS('font-weight', '600');
  await settleMotion(app.locator('body'));
  const color = await name.evaluate(node => getComputedStyle(node).color);
  await expect(target.getByRole('rowheader')).toHaveCSS('color', color);
  expect(await memberSlot.locator('td').last().evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(orderColor);
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(original);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/private/tmp/triadichrome-membership-intent-final.png' });

  await preview(app, '店内売上高', false);
  await expect(app.locator('.aggregation-trays path.is-highlighted')).toHaveCount(0);
  await expect(name).toHaveAttribute('aria-pressed', 'false');
  await app.getByRole('button', { name: '旅費を移動', exact: true }).press('Escape');
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(0);
  await expect(app.getByRole('button', { name: '管理可能費小計の範囲', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(original);
});

test('仮表示へのドロップが保存に失敗しても、行とL字と加減を元のまま保つ', async ({ app, page }) => {
  await page.locator('#dataset').selectOption('defaults');
  await page.locator('#scenario').selectOption('save-failure');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await openMaster(app);
  const rows = app.locator('tr[data-row]');
  const order = await rows.evaluateAll(nodes => nodes.map(node => [node.getAttribute('data-row'), node.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')]));
  const paths = await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  await (await preview(app, '社内売上小計', true)).dispatchEvent('drop');
  await expect(app.getByRole('alert')).toContainText('テスト用の保存失敗');
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(0);
  expect(await rows.evaluateAll(nodes => nodes.map(node => [node.getAttribute('data-row'), node.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')]))).toEqual(order);
  await expect.poll(() => app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(paths);
});
