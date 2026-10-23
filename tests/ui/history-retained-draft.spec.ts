import { test, expect, openInitiativeEntry, selectClassification } from './fixtures';

test('履歴入口の取消では未登録入力を保持し、破棄の承認後だけ履歴へ進む', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await openInitiativeEntry(app);
  const name = app.getByRole('textbox', { name: '施策名', exact: true });
  const note = app.getByRole('textbox', { name: '備考', exact: true });
  await name.fill('履歴から再開する施策'); await note.fill('登録前の備考');
  for (const [label, value] of [['展開名', '料金改定'], ['部署名', '部署A'], ['業種名', '直営自動車'], ['期間名', '新規']] as const)
    await selectClassification(app.getByRole('combobox', { name: label, exact: true }), value);
  const account = app.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await account.focus(); await account.selectOption('1');
  const april = app.getByRole('spinbutton', { name: '売上高 4月の金額', exact: true });
  await april.fill('123.456');
  const may = app.getByRole('spinbutton', { name: '売上高 5月の金額', exact: true });
  await may.fill('0.0001');
  const menu = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await menu.getByRole('button', { name: '履歴', exact: true }).click();
  const dialog = app.getByRole('alertdialog');
  await expect(dialog).toContainText('未登録の入力は破棄');
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(name).toHaveValue('履歴から再開する施策');
  await expect(note).toHaveValue('登録前の備考');
  await expect(april).toHaveValue('123.456'); await expect(may).toHaveValue('0.0001');
  await expect(app.locator('.history-date')).toHaveCount(0);
  await menu.getByRole('button', { name: '履歴', exact: true }).click();
  await dialog.getByRole('button', { name: 'はい', exact: true }).click();
  await expect(app.locator('.history-date').first()).toBeVisible();
  await openInitiativeEntry(app);
  await expect(name).toHaveValue(''); await expect(note).toHaveValue(''); await expect(account).toHaveValue('');
});

type HistoryProbe = { handle: FileSystemFileHandle; fail: boolean; writes: number };
type TestWindow = Window & { showOpenFilePicker: () => Promise<FileSystemFileHandle[]>; historyProbe: HistoryProbe };

for (const outcome of ['view', 'cancel', 'failure', 'restore']) test(`登録済みデータの履歴を${outcome}した結果を検証する`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate(() => {
    const target = window as unknown as TestWindow;
    const picker = target.showOpenFilePicker;
    target.showOpenFilePicker = async () => {
      const [handle] = await picker();
      const probe = target.historyProbe = { handle: handle!, fail: false, writes: 0 };
      const create = handle!.createWritable.bind(handle);
      Object.defineProperty(handle, 'createWritable', { value: async () => {
        probe.writes++;
        if (probe.fail) throw new Error('履歴確認の復元失敗');
        return create();
      } });
      return [handle!];
    };
  });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  const menu = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await menu.getByRole('button', { name: '履歴', exact: true }).click();
  const dates = app.locator('.history-date');
  await expect(dates.first()).toBeVisible();
  const count = await dates.count();
  const before = await app.locator('body').evaluate(async () => Array.from(new Uint8Array(await (await (window as unknown as TestWindow).historyProbe.handle.getFile()).arrayBuffer())));
  await dates.last().click();
  const preview = app.getByLabel('過去のデータを閲覧中');
  await expect(preview).toBeVisible();
  if (outcome !== 'view') {
    await preview.getByRole('button', { name: 'この時点に戻す', exact: true }).click();
    const dialog = app.getByRole('alertdialog');
    if (outcome === 'cancel') await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    else {
      await app.locator('body').evaluate((_, fail) => { const probe = (window as unknown as TestWindow).historyProbe; probe.fail = fail; probe.writes = 0; }, outcome === 'failure');
      await dialog.getByRole('button', { name: 'この時点に戻す', exact: true }).click();
      if (outcome === 'failure') {
        await expect(dialog).toContainText('履歴確認の復元失敗');
        expect(await app.locator('body').evaluate(() => (window as unknown as TestWindow).historyProbe.writes)).toBe(1);
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        await expect(preview).toBeVisible();
      }
    }
  }
  if (outcome === 'restore') await expect(preview).toHaveCount(0);
  else await preview.getByRole('button', { name: '現在に戻る', exact: true }).click();
  await expect(app.getByRole('heading', { name: '履歴', exact: true })).toBeVisible();
  const after = await app.locator('body').evaluate(async () => Array.from(new Uint8Array(await (await (window as unknown as TestWindow).historyProbe.handle.getFile()).arrayBuffer())));
  if (outcome === 'restore') {
    expect(after).not.toEqual(before);
    expect(await dates.count()).toBeGreaterThan(count);
  } else {
    expect(after).toEqual(before); await expect(dates).toHaveCount(count);
  }
});
