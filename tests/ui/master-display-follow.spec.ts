import { test, expect } from './fixtures';

for (const subject of ['account', 'group']) for (const space of [' ', '　']) test(`${subject}の同名表示を${space === ' ' ? '半角' : '全角'}空白付きで保存しても連続改名へ追従する`, async ({ app }) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: 'マスタ', exact: true }).click();
  const name = subject === 'account' ? '売上高' : '追従確認集計';
  await app.getByRole('button', { name: subject === 'account' ? /^勘定科目マスタ/ : /^集計マスタ/ }).click();
  if (subject === 'group') {
    await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
    await app.getByRole('textbox', { name: '集計名', exact: true }).fill(name);
    await app.getByRole('button', { name: '登録', exact: true }).click();
    await expect(app.getByRole('button', { name: `${name}を移動`, exact: true })).toBeEnabled();
    await app.getByRole('button', { name: `${name}を移動`, exact: true }).press('F2');
  } else await app.getByRole('button', { name: `${name}を編集`, exact: true }).click();
  const editing = app.locator(subject === 'account' ? '.master-row-editing' : '.aggregation-inline-edit');
  const display = editing.getByRole('textbox', { name: /の表示名$/ });
  const formal = editing.getByRole('textbox', { name: /の(?:名称|集計名)$/ });
  await display.fill(`${space}${name}${space}`);
  await expect(app.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  await formal.fill('新 名称');
  await expect(display).toHaveValue('新 名称');
  await expect(app.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  await app.getByRole('button', { name: '完了', exact: true }).click();
  if(subject === 'account') await app.getByRole('button', { name: '新 名称を編集', exact: true }).click();
  else await app.getByRole('button', { name: '新 名称を移動', exact: true }).press('F2');
  await expect(display).toHaveValue('新 名称');
  // Interior spaces identify a deliberately different display name.
  await display.fill('独自 表示');
  await expect(app.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  await formal.fill('次 名称');
  await expect(display).toHaveValue('独自 表示');
  await expect(app.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  await app.getByRole('button', { name: '完了', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '総原価表', exact: true }).click();
  await expect(app.locator('.cost-table th[scope="row"]').filter({ hasText: '独自 表示' })).toHaveCount(1);
});


for (const mode of ['during', 'failure']) test(`空白正規化後の改名でも${mode === 'during' ? '保存中の追加入力' : '失敗・再試行・入力取消'}を保護する`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=defaults');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate((_body, mode: string) => {
    const target = window as Window & { showOpenFilePicker?: () => Promise<FileSystemFileHandle[]>; renameSave?: { started: boolean; release: () => void } };
    const picker = target.showOpenFilePicker!;
    target.showOpenFilePicker = async () => {
      const [handle] = await picker();
      const create = handle!.createWritable.bind(handle);
      let first = true;
      Object.defineProperty(handle, 'createWritable', { value: async () => {
        if (first && mode === 'failure') { first = false; throw new Error('改名の保存失敗'); }
        const writer = await create(), close = writer.close.bind(writer);
        Object.defineProperty(writer, 'close', { value: async () => {
          if (first && mode === 'during') {
            first = false;
            await new Promise<void>(resolve => { target.renameSave = { started: true, release: resolve }; });
          }
          await close();
        } });
        return writer;
      } });
      return [handle!];
    };
  }, mode);
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^勘定科目マスタ/ }).click();
  await app.getByRole('button', { name: '売上高を編集', exact: true }).click();
  const row = app.locator('.master-row-editing');
  const display = row.getByRole('textbox', { name: /の表示名$/ });
  const name = row.getByRole('textbox', { name: /の(?:名称|集計名)$/ });
  await display.fill(' 売上高 ');
  await expect(app.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  await name.fill('途中の名称');
  if (mode === 'during') {
    await expect.poll(() => app.locator('body').evaluate(() => Boolean((window as Window & { renameSave?: { started: boolean } }).renameSave?.started))).toBe(true);
    await name.fill('追加した名称');
    await app.locator('body').evaluate(() => (window as Window & { renameSave?: { release: () => void } }).renameSave!.release());
    await expect(display).toHaveValue('追加した名称');
  } else {
    await expect(app.getByRole('alert')).toContainText('改名の保存失敗');
    await expect(name).toHaveValue('途中の名称'); await expect(display).toHaveValue('途中の名称');
    await app.getByRole('button', { name: '保存を再試行', exact: true }).click();
  }
  await expect(app.getByRole('button', { name: '完了', exact: true })).toBeEnabled();
  const savedName = mode === 'during' ? '追加した名称' : '途中の名称';
  await name.fill('');
  await expect(app.getByRole('alert')).toContainText('表示名を入力');
  await app.getByRole('button', { name: '入力を取り消す', exact: true }).click();
  await expect(name).toHaveValue(savedName); await expect(display).toHaveValue(savedName);
  await app.getByRole('button', { name: '完了', exact: true }).click();
  await app.getByRole('button', { name: `${savedName}を編集`, exact: true }).click();
  await expect(display).toHaveValue(savedName);
});
