import { test, expect, openInitiativeEntry, selectClassification } from './fixtures';

for (const outcome of ['view', 'cancel', 'failure', 'restore']) test(`履歴の${outcome}後は保持中の施策を再開でき、復元成功時だけ初期化する`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  if (outcome === 'failure') await app.locator('body').evaluate(() => {
    const target = window as Window & { showOpenFilePicker?: () => Promise<FileSystemFileHandle[]> };
    const picker = target.showOpenFilePicker!;
    target.showOpenFilePicker = async () => {
      const [handle] = await picker();
      Object.defineProperty(handle, 'createWritable', { value: async () => { throw new Error('下書き確認の復元失敗'); } });
      return [handle!];
    };
  });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await openInitiativeEntry(app);
  const name = app.getByRole('textbox', { name: '施策名', exact: true });
  const note = app.getByRole('textbox', { name: '備考', exact: true });
  await name.fill('履歴から再開する施策'); await note.fill('登録前の備考');
  for (const [label, value] of [['展開名','料金改定'], ['部署名','部署A'], ['業種名','直営自動車'], ['期間名','新規']] as const)
    await selectClassification(app.getByRole('combobox', { name: label, exact: true }), value!);
  const account = app.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await account.focus(); await account.selectOption('1');
  const april = app.getByRole('spinbutton', { name: '売上高 4月の金額', exact: true });
  await april.first().fill('123.456');
  await app.getByRole('button', { name: '＋ 勘定科目を追加', exact: true }).click();
  const second = app.getByRole('combobox', { name: '2行目の勘定科目', exact: true });
  await second.focus(); await second.selectOption('1');
  await april.nth(1).fill('-5.5');
  await app.getByRole('tab', { name: '確定予算', exact: true }).click();
  await april.first().fill('0');
  await app.getByRole('tab', { name: '一次予算', exact: true }).click();
  const may = app.getByRole('spinbutton', { name: '売上高 5月の金額', exact: true }).first();
  await may.fill('0.0001');
  const menu = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await menu.getByRole('button', { name: '履歴', exact: true }).click();
  const back = app.getByRole('button', { name: '前の画面に戻る', exact: true });
  await expect(back).toBeEnabled();
  await app.locator('.history-date').last().click();
  const preview = app.getByLabel('過去のデータを閲覧中');
  await expect(preview).toBeVisible();
  await expect(back).toBeDisabled();
  if (outcome !== 'view') {
    await preview.getByRole('button', { name: 'この時点に戻す', exact: true }).click();
    const dialog = app.getByRole('alertdialog');
    if (outcome === 'cancel') await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    else {
      await dialog.getByRole('button', { name: 'この時点に戻す', exact: true }).click();
      if (outcome === 'failure') {
        await expect(dialog).toContainText('下書き確認の復元失敗');
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      }
    }
  }
  if (outcome === 'restore') {
    await expect(preview).toHaveCount(0);
    await expect(back).toBeDisabled();
    await openInitiativeEntry(app);
    await expect(name).toHaveValue(''); await expect(note).toHaveValue('');
    await expect(account).toHaveValue(''); await expect(second).toHaveCount(0);
    return;
  }
  // Past navigation has an independent lifetime and never exposes the current draft.
  await menu.getByRole('button', { name: '施策一覧', exact: true }).click();
  await expect(app.getByRole('button', { name: '施策を追加', exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: '現在に戻る', exact: true }).click();
  await expect(app.getByRole('heading', { name: '履歴', exact: true })).toBeVisible();
  await expect(back).toBeEnabled();
  await back.click();
  await expect(name).toHaveValue('履歴から再開する施策'); await expect(note).toHaveValue('登録前の備考');
  await expect(april.first()).toHaveValue('123.456'); await expect(april.nth(1)).toHaveValue('-5.5');
  await expect(may).toHaveValue('0.0001');
  for (const [label, value] of [['展開名','2'], ['部署名','1'], ['業種名','1'], ['期間名','2']] as const)
    await expect(app.getByRole('combobox', { name: label, exact: true })).toHaveValue(value!);
  await app.getByRole('tab', { name: '確定予算', exact: true }).click();
  await expect(april.first()).toHaveValue('0'); await expect(april.nth(1)).toHaveValue('-5.5');
  await menu.getByRole('button', { name: '施策一覧', exact: true }).click();
  await expect(app.getByRole('alertdialog')).toContainText('入力内容を破棄');
  await app.getByRole('alertdialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(name).toHaveValue('履歴から再開する施策');
});
