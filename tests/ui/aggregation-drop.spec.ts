import type { FrameLocator, Locator } from '@playwright/test';
import { test, expect, settleMotion } from './fixtures';

async function openMaster(app: FrameLocator) {
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  await app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).first().click();
  await settleMotion(app.locator('body'));
}

async function pointAt(target: Locator, into: boolean) {
  return target.evaluate((node, into) => {
    const row = node.closest('tr')!;
    row.cells[2]!.scrollIntoView({ block: 'center', inline: 'center' });
    const bounds = row.getBoundingClientRect(), region = row.closest('.aggregation-grid-scroll')!.getBoundingClientRect();
    return { clientX: Math.max(region.left + 12, Math.min(region.right - 12, row.cells[2]!.getBoundingClientRect().left + 20)), clientY: bounds.top + (into ? 20 : 1) };
  }, into);
}
async function movePointer(app: FrameLocator, point: { clientX: number; clientY: number }) {
  await app.locator('body').evaluate((node, point) => {
    node.ownerDocument.dispatchEvent(new PointerEvent('pointermove', { ...point, bubbles: true, pointerId: 1, button: 0, buttons: 1, isPrimary: true }));
  }, point);
}
async function preview(app: FrameLocator, target: string, into: boolean) {
  const handle = app.getByRole('button', { name: '旅費を移動', exact: true });
  const active = await handle.getAttribute('aria-pressed') === 'true' && await app.locator('.aggregation-floating-row').count() > 0;
  if (!active) await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  const point = await pointAt(app.getByRole('button', { name: target + 'を移動', exact: true }), into);
  if (!active) await handle.evaluate(node => {
    const bounds = node.getBoundingClientRect(), clientX = bounds.left + bounds.width / 2, clientY = bounds.top + bounds.height / 2;
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX, clientY, pointerId: 1, button: 0, buttons: 1, isPrimary: true }));
    node.ownerDocument.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: clientX + 12, clientY, pointerId: 1, button: 0, buttons: 1, isPrimary: true }));
  });
  await movePointer(app, point);
  const slot = app.getByRole('row', { name: '旅費の移動先', exact: true });
  await expect(slot).toBeVisible();
  return slot;
}
async function release(slot: Locator) {
  await settleMotion(slot);
  await slot.evaluate(node => {
    const rect = node.querySelector('.aggregation-slot-content')!.getBoundingClientRect();
    const region = node.closest('.aggregation-grid-scroll')!.getBoundingClientRect();
    node.ownerDocument.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: Math.max(region.left + 12, Math.min(region.right - 12, rect.left + 20)), clientY: rect.top + rect.height / 2, pointerId: 1, button: 0, isPrimary: true }));
  });
}

test('マウスで開いた行間にドロップでき、移動先を示す仮表示が安定する', async ({ app, page }, testInfo) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await openMaster(app);
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
  const block = app.locator('.aggregation-floating-row');
  await expect(block).toBeVisible();
  await expect(block).toContainText(sourceName);
  const liftedFrom = (await block.boundingBox())!;
  await expect(handle.locator('xpath=ancestor::td')).toHaveCSS('opacity', '0');
  await page.mouse.move(to.x + 30, to.y + 1, { steps: 16 });
  const slot = app.getByRole('row', { name: sourceName + 'の移動先', exact: true });
  await expect(slot).toBeVisible();
  await expect.poll(async () => Math.abs((await block.boundingBox())!.y - liftedFrom.y)).toBeGreaterThan(20);
  const bounds = (await slot.locator('.aggregation-slot-content').boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + bounds.height / 2, { steps: 4 });
  await expect(slot).toBeVisible();
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(order);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/private/tmp/triadichrome-lifted-row.png' });
  await page.mouse.up();
  await expect(slot).toHaveCount(0);
  await expect(handle).toBeEnabled();
  await expect(block).toHaveCount(0);
  await expect(handle.locator('xpath=ancestor::td')).toHaveCSS('opacity', '1');
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
  await expect.poll(position).toBe(targetTop + 36);
  await expect(slot).toContainText('行順のみ · 所属は変更しません');
  await app.getByRole('button', { name: '旅費を移動', exact: true }).press('Escape');
  await expect(slot).toHaveCount(0);
  await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  await expect.poll(position).toBe(targetTop);
  expect(await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(paths);

  await release(await preview(app, '店内売上高', false));
  await expect(app.getByRole('button', { name: '旅費を移動', exact: true })).toBeEnabled();
  const travel = rows.filter({ has: app.getByRole('button', { name: '旅費を移動', exact: true }) });
  await expect(travel.getByRole('button', { name: '加算', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await travel.getByRole('rowheader').click();
  await expect(app.getByRole('button', { name: '管理可能費小計の範囲', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  const moved = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const travelKey = await travel.getAttribute('data-row'), targetKey = await target.getAttribute('data-row');
  expect(moved.indexOf(travelKey)).toBe(moved.indexOf(targetKey) - 1);

  await release(await preview(app, '社内売上小計', true));
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
  await release(await preview(app, '社内売上小計', true));
  await expect(app.getByRole('alert')).toContainText('テスト用の保存失敗');
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(0);
  await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  await expect(app.getByRole('button', { name: '旅費を移動', exact: true }).locator('xpath=ancestor::td')).toHaveCSS('opacity', '1');
  expect(await rows.evaluateAll(nodes => nodes.map(node => [node.getAttribute('data-row'), node.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')]))).toEqual(order);
  await expect.poll(() => app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(paths);
});

test('行間の切替と途中反転を現在の高さからつなぎ、行の追従を毎描画更新する', async ({ app }) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await openMaster(app);
  const rows = app.locator('tr[data-row]');
  const original = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')));
  const slot = await preview(app, '店内売上高', false);
  await settleMotion(slot);
  const samples = await app.locator('body').evaluate(async node => {
    const doc = node.ownerDocument;
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const target = (name: string) => doc.querySelector<HTMLButtonElement>(`button[aria-label="${name}を移動"]`)!.closest('tr')!;
    const first = target('店内売上高'), second = target('本支店売上高');
    const key = first.dataset.row!;
    const height = () => doc.querySelector<HTMLTableRowElement>(`.aggregation-drop-slot[data-drop-target="${key}"]`)?.getBoundingClientRect().height ?? 0;
    const move = (row: HTMLTableRowElement) => {
      const rect = row.getBoundingClientRect(), region = row.closest('.aggregation-grid-scroll')!.getBoundingClientRect();
      doc.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, button: 0, buttons: 1, isPrimary: true,
        clientX: Math.max(region.left + 12, Math.min(region.right - 12, row.cells[2]!.getBoundingClientRect().left + 20)), clientY: rect.top + 1 }));
    };
    move(second); await frame(); await frame(); await frame();
    const closing = height();
    move(first); await frame(); await frame();
    const reopening = height();
    const slot = doc.querySelector<HTMLTableRowElement>(`.aggregation-drop-slot[data-drop-target="${key}"]`)!;
    const rect = slot.getBoundingClientRect(), cell = slot.cells[2]!.getBoundingClientRect();
    const region = first.closest('.aggregation-grid-scroll')!.getBoundingClientRect();
    const startX = Math.max(region.left + 12, Math.min(region.right - 40, cell.left + 20)), clientY = rect.top + Math.min(5, rect.height / 2);
    const positions: number[] = [];
    for (let index = 0; index < 6; index++) {
      doc.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, button: 0, buttons: 1, isPrimary: true, clientX: startX + index * 5, clientY }));
      await frame();
      positions.push(doc.querySelector('.aggregation-floating-row')!.getBoundingClientRect().left);
    }
    return { closing, reopening, positions };
  });
  expect(samples.closing).toBeGreaterThan(0);
  expect(samples.closing).toBeLessThan(36);
  expect(samples.reopening).toBeGreaterThan(0);
  expect(samples.reopening).toBeLessThan(36);
  for (let index = 1; index < samples.positions.length; index++) expect(samples.positions[index]! - samples.positions[index - 1]!).toBeCloseTo(5, 0);
  await settleMotion(slot);
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(1);
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(original);
  await app.getByRole('button', { name: '旅費を移動', exact: true }).press('Escape');
  await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(0);
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(original);
});

test('集計を掴むと配下の子集計・科目も浮き、行順だけの移動で所属と加減を保つ', async ({ app, page }, testInfo) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await openMaster(app);
  const table = app.getByRole('table', { name: '集計マスタ', exact: true });
  const rows = table.locator('tr[data-row]');
  const original = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')!));
  const signs = () => rows.evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.getAttribute('data-row'), node.querySelector('.master-sign-selector [aria-pressed="true"]')?.getAttribute('aria-label') ?? null])));
  const beforeSigns = await signs();
  const source = table.getByRole('button', { name: '売上合計を移動', exact: true });
  const sourceKey = (await source.locator('xpath=ancestor::tr').getAttribute('data-row'))!;
  const moving = original.slice(0, original.indexOf(sourceKey) + 1);
  expect(moving).toHaveLength(7);
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 3 });
  const block = app.locator('.aggregation-floating-row');
  await expect(block).toBeVisible();
  await expect(block.locator('tbody tr')).toHaveCount(7);
  await expect(block).toContainText('社外売上小計');
  await expect(block).toContainText('社内売上小計');
  await expect(block).toContainText('グループ売上高');
  for (const key of moving) await expect(table.locator(`tr[data-row="${key}"]>.aggregation-handle-cell`)).toHaveCSS('opacity', '0');
  const target = table.getByRole('row').filter({ has: app.getByRole('button', { name: '通信運搬費を移動', exact: true }) });
  const targetKey = (await target.getAttribute('data-row'))!;
  await target.getByRole('rowheader').scrollIntoViewIfNeeded();
  const to = (await target.getByRole('rowheader').boundingBox())!, viewport = (await app.getByRole('region', { name: '集計の構成', exact: true }).boundingBox())!;
  await page.mouse.move(Math.max(viewport.x + 12, Math.min(viewport.x + viewport.width - 12, to.x + 20)), to.y + 1);
  const slot = app.getByRole('row', { name: '合計の移動先', exact: true });
  await expect(slot).toBeVisible();
  await settleMotion(slot);
  expect(await slot.evaluate(node => node.getBoundingClientRect().height)).toBe(217);
  await expect(slot).toContainText('行順のみ');
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(original);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/private/tmp/triadichrome-group-block.png' });
  await page.mouse.up();
  await expect(block).toHaveCount(0);
  await expect(app.locator('.aggregation-drop-slot')).toHaveCount(0);
  const expected = original.filter(key => !moving.includes(key));
  expected.splice(expected.indexOf(targetKey), 0, ...moving);
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row')))).toEqual(expected);
  expect(await signs()).toEqual(beforeSigns);
  const groupId = sourceKey.split(':')[1];
  await expect(app.locator(`.aggregation-tray-outlines path[data-group-id="${groupId}"]`)).toHaveCount(1);
});
