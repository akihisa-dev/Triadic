import { test, expect, settleMotion } from './fixtures';
import type { FrameLocator, Locator, Page } from '@playwright/test';

async function open(page: Page, app: FrameLocator, screen: string) {
  await page.goto('/tests/ui/preview.html');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate(() => {
    const target = window as unknown as { showOpenFilePicker: () => Promise<FileSystemFileHandle[]>; headerFile?: FileSystemFileHandle; headerWrites: number };
    const pick = target.showOpenFilePicker; target.headerWrites = 0;
    target.showOpenFilePicker = async () => {
      const handles = await pick(), handle = handles[0]!, create = handle.createWritable.bind(handle);
      target.headerFile = handle;
      handle.createWritable = async (...args) => { target.headerWrites++; return create(...args); };
      return handles;
    };
  });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: screen, exact: true }).click();
  await settleMotion(app.locator('body'));
}
async function filter(app: FrameLocator, table: Locator, name: string) {
  const trigger = table.getByRole('button', { name: new RegExp(`^${name}を絞り込む`) });
  await trigger.focus(); await trigger.press('Enter');
  const panel = app.getByRole('dialog', { name: new RegExp(`^${name}(?:（完全一致）)?$`) });
  await expect(panel).toBeVisible(); return panel;
}
async function choice(app: FrameLocator, table: Locator, name: string, value: string) {
  const panel = await filter(app, table, name);
  await panel.getByRole('checkbox', { name: 'すべて選択', exact: true }).uncheck();
  await panel.getByRole('checkbox', { name: value, exact: true }).check();
  await panel.getByRole('button', { name: '適用', exact: true }).click();
}
async function text(app: FrameLocator, table: Locator, name: string, value: string) {
  const panel = await filter(app, table, name);
  await panel.getByRole('searchbox', { name: '含む文字', exact: true }).fill(value);
  await panel.getByRole('button', { name: '適用', exact: true }).click();
}
async function clear(app: FrameLocator, table: Locator, name: string) {
  const panel = await filter(app, table, name);
  await panel.getByRole('button', { name: '解除', exact: true }).click();
}

test('施策一覧: 複合条件・並べ替え・空結果・解除・詳細からの復帰を保存せず行う', async ({ page, app }) => {
  await open(page, app, '施策一覧');
  const table = app.getByRole('table', { name: '施策一覧', exact: true });
  const names = table.locator('tbody .initiative-name-button');
  const total = await names.count(); expect(total).toBeGreaterThan(5);
  await choice(app, table, '展開名', 'コスト');
  const costCount = await names.count(); expect(costCount).toBeGreaterThan(0); expect(costCount).toBeLessThan(total);
  await table.getByRole('button', { name: '施策名', exact: true }).click();
  await expect(table.locator('th[aria-sort="ascending"]')).toHaveCount(1);
  await expect(table.getByRole('button', { name: '展開名を絞り込む（適用中）', exact: true })).toBeVisible();
  await text(app, table, '施策名', '通信運搬');
  await expect(names).toHaveCount(1);
  await names.first().click();
  await app.getByRole('button', { name: '← 施策一覧へ戻る', exact: true }).click();
  await expect(names).toHaveCount(1);
  await expect(table.locator('th[aria-sort="ascending"]')).toHaveCount(1);
  await text(app, table, '施策名', '存在しない名称');
  await expect(table.getByRole('status')).toHaveText('条件に合う行がありません。');
  await clear(app, table, '施策名');
  await expect(names).toHaveCount(costCount);
  await clear(app, table, '展開名');
  await expect(names).toHaveCount(total);
  const numeric = await filter(app, table, '4月 利益');
  await numeric.getByRole('radio', { name: '範囲を指定', exact: true }).check();
  await numeric.getByRole('textbox', { name: '以上', exact: true }).fill('100');
  await numeric.getByRole('textbox', { name: '以下', exact: true }).fill('-100');
  await numeric.getByRole('button', { name: '適用', exact: true }).click();
  await expect(numeric.getByRole('alert')).toBeVisible();
  await numeric.getByRole('textbox', { name: '以上', exact: true }).press('Escape');
  await expect(numeric).toHaveCount(0);
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});

test('展開表: 分類のまとまり・小計・期間金額と空結果の解除を保つ', async ({ page, app }) => {
  await open(page, app, '展開表');
  const table = app.getByRole('table', { name: '展開表', exact: true });
  const names = table.locator('tbody .initiative-name-button');
  const count = await names.count();
  await choice(app, table, '展開名', 'コスト');
  expect(await names.count()).toBeLessThan(count);
  await expect(table.locator('.expansion-subtotal')).toHaveCount(1);
  await expect(table.getByRole('rowheader', { name: 'コスト計（表示中）', exact: true })).toBeVisible();
  const groupCount = await names.count();
  await table.getByRole('button', { name: '施策名', exact: true }).click();
  await table.getByRole('button', { name: '施策名', exact: true }).click();
  await expect(names).toHaveCount(groupCount);
  const numeric = await filter(app, table, '4月 一次予算 利益');
  await numeric.getByRole('radio', { name: '0より大きい', exact: true }).check();
  await numeric.getByRole('button', { name: '適用', exact: true }).click();
  const visible = await names.count(); expect(visible).toBeGreaterThan(0);
  await names.first().click();
  await app.getByRole('button', { name: '← 展開表へ戻る', exact: true }).click();
  await expect(names).toHaveCount(visible);
  await expect(table.getByRole('button', { name: '展開名を絞り込む（適用中）', exact: true })).toBeVisible();
  const sum = await table.locator('tbody tr:has(.initiative-name-button)').evaluateAll(rows => rows.reduce((total, row) => {
    const amounts = row.querySelectorAll('td[title]');
    // Amount cells include title; category titles are excluded by their class.
    const profit = [...amounts].filter(cell => !cell.classList.contains('expansion-category'))[1];
    return total + Number((profit?.textContent ?? '').replaceAll(',', '') || 0);
  }, 0));
  const subtotal = table.locator('.expansion-subtotal td').nth(1);
  await expect(subtotal).toHaveText(new Intl.NumberFormat('ja-JP').format(sum));
  await text(app, table, '施策名', '存在しない名称');
  await expect(table.getByRole('status')).toBeVisible();
  await clear(app, table, '施策名');
  await expect(names).toHaveCount(visible);
  await clear(app, table, '4月 一次予算 利益');
  await clear(app, table, '展開名');
  await expect(names).toHaveCount(count);
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});

test('各マスタ: 名称で絞り、編集中の行を保持し、勘定科目の保存順操作を区別する', async ({ page, app }) => {
  await open(page, app, 'マスタ');
  for (const [subject, label] of [['展開', '展開名'], ['展開区分', '展開区分名'], ['部署', '部署名'], ['業種', '業種名'], ['期間', '期間名']] as const) {
    await app.getByRole('button', { name: new RegExp(`^${subject}マスタ`) }).click();
    await settleMotion(app.locator('body'));
    const table = app.getByRole('table', { name: `${subject}一覧`, exact: true });
    await text(app, table, label, '存在しない名称');
    await expect(table).toContainText('条件に合う行がありません。');
    await clear(app, table, label);
    await table.getByRole('button', { name: label, exact: true }).click();
    const original = await filter(app, table, label);
    await original.getByRole('button', { name: '元の並び順に戻す', exact: true }).click();
    await app.getByRole('button', { name: '← マスタへ戻る', exact: true }).click();
  }
  await app.getByRole('button', { name: /^勘定科目マスタ/ }).click();
  const accounts = app.getByRole('table', { name: '勘定科目一覧', exact: true });
  await accounts.getByRole('button', { name: '名称', exact: true }).click();
  for (const handle of await accounts.getByRole('button', { name: /を並べ替え$/ }).all()) await expect(handle).toBeDisabled();
  const popup = await filter(app, accounts, '名称');
  await popup.getByRole('button', { name: '元の並び順に戻す', exact: true }).click();
  await expect(accounts.getByRole('button', { name: /を並べ替え$/ }).first()).toBeEnabled();
  await app.getByRole('button', { name: '← マスタへ戻る', exact: true }).click();
  await app.getByRole('button', { name: /^期間マスタ/ }).click();
  const periods = app.getByRole('table', { name: '期間一覧', exact: true });
  const name = await periods.locator('tbody th').first().innerText();
  await text(app, periods, '期間名', name);
  await periods.getByRole('button', { name: `${name}を編集`, exact: true }).click();
  const input = periods.locator('tbody input').first();
  await input.fill('名称変更後');
  await expect(periods.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  await page.waitForTimeout(900);
  await expect(input).toHaveValue('名称変更後');
  await periods.getByRole('button', { name: '完了', exact: true }).click();
  await expect(periods).toContainText('条件に合う行がありません。');
  await clear(app, periods, '期間名');
  await expect(periods.getByRole('button', { name: '名称変更後を編集', exact: true })).toBeVisible();
});

test('履歴: 表示中だけを全選択し、隠れた履歴の削除選択を残さない', async ({ page, app }) => {
  await open(page, app, '履歴');
  const table = app.locator('.data-history-list table');
  const dates = app.locator('.history-date');
  const first = await dates.first().innerText();
  await table.getByRole('checkbox', { name: 'すべての履歴を選択', exact: true }).check();
  await choice(app, table, '記録日時', first);
  await expect(dates).toHaveCount(1);
  await expect(table.locator('tbody input:checked')).toHaveCount(1);
  await clear(app, table, '記録日時');
  await expect(dates).toHaveCount(3);
  await expect(table.locator('tbody input:checked')).toHaveCount(1);
  await expect(app.getByRole('button', { name: '選択した履歴を削除', exact: true })).toBeEnabled();
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});

test('内訳と履歴差分: 親ダイアログを閉じずに条件編集を取り消せる', async ({ page, app }) => {
  await open(page, app, '総原価表');
  const amount = app.getByRole('button', { name: '売上高 4月 一次予算の内訳', exact: true });
  await amount.focus(); await amount.press('Enter');
  const breakdown = app.getByRole('dialog', { name: '売上高 4月 一次予算の内訳', exact: true });
  const table = breakdown.getByRole('table');
  await text(app, table, '前年・施策', '存在しない名称');
  await expect(table.getByRole('status')).toBeVisible();
  await clear(app, table, '前年・施策');
  const panel = await filter(app, table, '反映額');
  await panel.getByRole('radio', { name: 'すべて', exact: true }).press('Escape');
  await expect(breakdown).toBeVisible();
  await breakdown.getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '履歴', exact: true }).click();
  await app.getByRole('button', { name: /と現在の差分$/ }).last().click();
  const dialog = app.getByRole('dialog', { name: '履歴と現在の差分', exact: true });
  const income = dialog.getByRole('table', { name: '履歴と現在の収支への影響', exact: true });
  await choice(app, income, '項目', '利益');
  await expect(income.locator('tbody tr')).toHaveCount(1);
  await clear(app, income, '項目');
  await dialog.getByRole('button', { name: '変更項目', exact: true }).click();
  const differences = dialog.getByRole('table', { name: '履歴と現在の変更箇所', exact: true });
  await text(app, differences, '項目', '存在しない名称');
  await expect(differences.getByRole('status')).toBeVisible();
  await clear(app, differences, '項目');
  await expect(differences.locator('tbody tr')).toHaveCount(2);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});

test('セルのアイコン: 他列の条件と順序を維持し、名称は完全一致で絞る', async ({ page, app }) => {
  await open(page, app, '施策一覧');
  const table = app.getByRole('table', { name: '施策一覧', exact: true });
  const names = table.locator('tbody .initiative-name-button');
  const period = await table.locator('tbody tr').filter({ hasText: 'コスト' }).first().locator('td.initiative-list-period').innerText();
  await choice(app, table, '期間名', period);
  await table.getByRole('button', { name: '施策名', exact: true }).click();
  await table.getByRole('button', { name: '施策名', exact: true }).click();
  const before = await names.allTextContents();
  const cell = table.locator('tbody td.initiative-list-expansion').filter({ hasText: 'コスト' }).first();
  await cell.click({ button: 'right' });
  const menu = app.getByRole('menu', { name: 'セルの絞り込み', exact: true });
  const action = menu.getByRole('menuitem', { name: 'この値で絞り込む', exact: true });
  await expect(action).toBeVisible(); await expect(action).toHaveText(''); await expect(action.locator('svg')).toHaveCount(1);
  expect(await names.allTextContents()).toEqual(before);
  await action.press('Escape'); await expect(menu).toHaveCount(0);
  await cell.click({ button: 'right' }); await action.click();
  const expected = await table.locator('tbody tr:has(.initiative-name-button)').allTextContents();
  expect(expected.length).toBeGreaterThan(0); expect(expected.length).toBeLessThan(before.length);
  for (const value of expected) { expect(value).toContain('コスト'); expect(value).toContain(period); }
  await expect(table.locator('th[aria-sort="descending"]')).toHaveAttribute('aria-label', '施策名');
  const exactName = await names.first().textContent();
  await names.first().press('Shift+F10'); await expect(action).toBeVisible(); await action.press('Enter');
  await expect(names).toHaveCount(1); await expect(names).toHaveText(exactName!);
  const exact = await filter(app, table, '施策名');
  await expect(exact.getByRole('searchbox', { name: '一致する値', exact: true })).toHaveValue(exactName!);
  await exact.getByRole('button', { name: '適用', exact: true }).click(); await expect(names).toHaveCount(1);
  await clear(app, table, '施策名'); expect(await table.locator('tbody tr:has(.initiative-name-button)').allTextContents()).toEqual(expected);
  await names.first().click(); await app.getByRole('button', { name: '← 施策一覧へ戻る', exact: true }).click();
  await expect.poll(() => table.locator('tbody tr:has(.initiative-name-button)').allTextContents()).toEqual(expected);
  await table.locator('tbody tr:has(.initiative-name-button) td').last().click({ button: 'right' });
  await expect(menu).toHaveCount(0);
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});

test('セルのアイコン: マスタの名称・所属を絞り、編集中は入力欄の操作を保つ', async ({ page, app }, testInfo) => {
  if (testInfo.project.name === 'narrow') await page.setViewportSize({ width: 375, height: 1100 });
  await open(page, app, 'マスタ');
  const menu = app.getByRole('menu', { name: 'セルの絞り込み', exact: true });
  for (const [subject, label] of [['展開', '展開名'], ['展開区分', '展開区分名'], ['部署', '部署名'], ['業種', '業種名'], ['期間', '期間名'], ['勘定科目', '名称']] as const) {
    await app.getByRole('button', { name: new RegExp(`^${subject}マスタ`) }).click();
    await settleMotion(app.locator('body'));
    const table = app.getByRole('table', { name: `${subject}一覧`, exact: true });
    const nameCell = table.locator('tbody th').first(), name = await nameCell.innerText();
    await nameCell.click({ button: 'right' }); await menu.getByRole('menuitem').click();
    await expect(table.locator('tbody th')).toHaveCount(1); await expect(table.locator('tbody th')).toHaveText(name);
    await clear(app, table, label);
    if (subject === '部署') {
      const relation = table.locator('tbody tr').first().locator('td').first(), value = await relation.innerText();
      await relation.click({ button: 'right' }); await menu.getByRole('menuitem').click();
      for (const row of await table.locator('tbody tr').all()) await expect(row.locator('td').first()).toHaveText(value);
      await clear(app, table, '業種名');
    }
    await table.getByRole('button', { name: `${name}を編集`, exact: true }).click();
    await table.locator('tbody input').first().click({ button: 'right' }); await expect(menu).toHaveCount(0);
    await table.getByRole('button', { name: '完了', exact: true }).click();
    await app.getByRole('button', { name: '← マスタへ戻る', exact: true }).click();
  }
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});

test('セルのアイコン: 展開表の結合セルと大量行でも同じ条件に絞る', async ({ page, app }, testInfo) => {
  if (testInfo.project.name === 'narrow') await page.setViewportSize({ width: 375, height: 1100 });
  for (const data of ['', '?data=signed-categories-large']) {
    await page.goto(`/tests/ui/preview.html${data}`); await expect(page.getByRole('status')).toHaveText('操作できます');
    await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '展開表', exact: true }).click();
    const table = app.getByRole('table', { name: '展開表', exact: true });
    await table.getByRole('button', { name: '施策名', exact: true }).click();
    const group = table.locator('tbody th.expansion-group').first(), name = await group.innerText();
    await group.click({ button: 'right' });
    await app.getByRole('menuitem', { name: 'この値で絞り込む', exact: true }).click();
    await expect(table.getByRole('button', { name: '展開名を絞り込む（適用中）', exact: true })).toBeVisible();
    for (const cell of await table.locator('tbody th.expansion-group').all()) await expect(cell).toHaveText(name);
    await expect(table.locator('th[aria-sort="ascending"]')).toHaveAttribute('aria-label', '施策名');
    const target = table.locator('tbody .initiative-name-button').first(), targetName = await target.innerText();
    await target.click({ button: 'right' }); await app.getByRole('menuitem', { name: 'この値で絞り込む', exact: true }).click();
    await expect(table.locator('tbody .initiative-name-button')).toHaveCount(1); await expect(table.locator('tbody .initiative-name-button')).toHaveText(targetName);
    await clear(app, table, '施策名'); await clear(app, table, '展開名');
  }
});

test('セルのアイコン: 内訳と履歴差分で取消・適用しても親を閉じない', async ({ page, app }) => {
  await open(page, app, '総原価表');
  const amountTrigger = app.getByRole('button', { name: '売上高 4月 一次予算の内訳', exact: true });
  await amountTrigger.focus(); await amountTrigger.press('Enter');
  const parent = app.getByRole('dialog', { name: '売上高 4月 一次予算の内訳', exact: true });
  const menu = app.getByRole('menu', { name: 'セルの絞り込み', exact: true });
  const account = parent.locator('tbody tr').first().locator('td').first(), value = await account.innerText();
  await account.click({ button: 'right' }); await menu.getByRole('menuitem').press('Escape');
  await expect(parent).toBeVisible(); await expect(menu).toHaveCount(0);
  await account.click({ button: 'right' }); await menu.getByRole('menuitem').click();
  await expect(parent).toBeVisible();
  for (const cell of await parent.locator('tbody tr td:first-of-type').all()) await expect(cell).toHaveText(value);
  await parent.getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '履歴', exact: true }).click();
  await app.getByRole('button', { name: /と現在の差分$/ }).last().click();
  const history = app.getByRole('dialog', { name: '履歴と現在の差分', exact: true });
  await history.getByRole('button', { name: '変更項目', exact: true }).click();
  const table = history.getByRole('table', { name: '履歴と現在の変更箇所', exact: true });
  const item = table.locator('tbody th').first(), name = await item.innerText();
  await item.click({ button: 'right' }); await menu.getByRole('menuitem').click();
  for (const cell of await table.locator('tbody th').all()) await expect(cell).toHaveText(name);
  await clear(app, table, '項目'); await expect(table.locator('tbody tr')).toHaveCount(2);
  await history.getByRole('button', { name: '閉じる', exact: true }).click();
  expect(await app.locator('body').evaluate(() => (window as unknown as { headerWrites: number }).headerWrites)).toBe(0);
});
