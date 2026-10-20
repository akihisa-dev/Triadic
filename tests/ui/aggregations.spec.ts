import { test, expect } from './fixtures';
import type { FrameLocator } from '@playwright/test';

async function master(app: FrameLocator, name: string) {
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: new RegExp('^' + name) }).click();
}

test('科目専用マスタと集計マスタを分離し、所属・加減・再読込を保持する', async ({ app }) => {
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '勘定科目マスタ');
  await expect(app.getByRole('table', { name: '勘定科目一覧' }).locator('tbody tr')).toHaveCount(0);
  await expect(app.getByRole('combobox', { name: '科目属性', exact: true }).getByRole('option', { name: '集計', exact: true })).toHaveCount(0);
  for (const [code, name] of [['500', '費用科目1'], ['600', '費用科目2']]) {
    await app.getByRole('textbox', { name: '科目コード', exact: true }).fill(code!);
    await app.getByRole('textbox', { name: '名称', exact: true }).fill(name!);
    await app.getByRole('combobox', { name: '科目属性', exact: true }).selectOption('expense');
    await app.getByRole('button', { name: '登録', exact: true }).click();
    await expect(app.getByRole('button', { name: name + 'を編集', exact: true })).toBeEnabled();
  }
  await master(app, '集計マスタ');
  const move = async (name: string, target: string) => {
    await app.getByRole('button', { name: name + 'を移動', exact: true }).click();
    await app.getByRole('button', { name: target + 'を移動', exact: true }).click();
    await expect(app.getByRole('button', { name: name + 'を移動', exact: true })).toBeEnabled();
  };
  const sign = (name: string) => app.getByRole('group', { name: name + 'の加減', exact: true }).getByRole('button', { name: '減算', exact: true });
  await move('費用科目1', '費用集計'); await move('費用科目2', '費用集計');
  await sign('費用科目2').click(); await expect(sign('費用科目2')).toBeEnabled();
  await move('費用集計', '営業利益');
  await sign('費用集計').click(); await expect(sign('費用集計')).toBeEnabled();
  await app.getByRole('button', { name: '営業利益を移動', exact: true }).click();
  await expect(app.getByRole('button', { name: '費用集計の範囲へ移動', exact: true })).toBeDisabled();
  await app.getByRole('button', { name: '営業利益を移動', exact: true }).press('Escape');
  await app.getByRole('button', { name: '費用科目2を移動', exact: true }).press('Delete');
  await expect(app.getByRole('button', { name: '費用科目2を移動', exact: true })).toBeEnabled();
  await expect(app.getByRole('table', { name: '未所属の科目・集計', exact: true })).toContainText('費用科目2');
  await expect(sign('費用科目2')).toHaveCount(0);
  const paths = await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-group-id')));
  await app.getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('alertdialog', { name: '閉じる', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '集計マスタ');
  await expect(sign('費用集計')).toHaveAttribute('aria-pressed', 'true');
  await expect(app.getByRole('table', { name: '未所属の科目・集計', exact: true })).toContainText('費用科目2');
  await expect(sign('費用科目2')).toHaveCount(0);
  await expect.poll(() => app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-group-id')))).toEqual(paths);
});

test('集計の同じ行で表示名を編集し、保存失敗と必須集計を保護する', async ({ app, page }) => {
  await page.locator('#scenario').selectOption('save-failure');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '集計マスタ');
  await app.getByRole('button', { name: '営業利益を移動', exact: true }).press('F2');
  await expect(app.getByRole('textbox', { name: '営業利益の集計名', exact: true })).toBeDisabled();
  const display = app.getByRole('textbox', { name: '営業利益の表示名', exact: true });
  await display.fill('保存待ち表示');
  await expect(app.getByRole('alert')).toContainText('テスト用の保存失敗');
  await expect(display).toHaveValue('保存待ち表示');
  await app.getByRole('button', { name: '入力を取り消す', exact: true }).click();
  await expect(display).toHaveValue('営業利益');
  await expect(app.getByRole('button', { name: '削除', exact: true })).toBeDisabled();
  await app.getByRole('button', { name: '完了', exact: true }).click();
  await expect(app.locator('.aggregation-inline-edit')).toHaveCount(0);
});

test('集計の登録時に集計名と表示名を別々に指定し、再読込後も保持する', async ({ app }) => {
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '集計マスタ');
  await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
  const form = app.getByRole('form', { name: '集計の新規登録' });
  const name = form.getByRole('textbox', { name: '集計名', exact: true });
  const display = form.getByRole('textbox', { name: '表示名', exact: true });
  await name.fill('新規集計');
  await expect(display).toHaveValue('新規集計');
  await display.fill('小計');
  await name.fill('確認用集計');
  await expect(display).toHaveValue('小計');
  await display.fill('　 ');
  await expect(form.getByRole('button', { name: '登録', exact: true })).toBeDisabled();
  await display.fill('小計');
  await form.getByRole('button', { name: '登録', exact: true }).click();
  await expect(form).toHaveCount(0);
  const pool = app.getByRole('table', { name: '未所属の科目・集計', exact: true });
  await expect(pool).toContainText('小計');
  await expect(pool).toContainText('確認用集計');
  await app.getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('alertdialog', { name: '閉じる', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '集計マスタ');
  await app.getByRole('button', { name: '確認用集計を移動', exact: true }).press('F2');
  await expect(app.getByRole('textbox', { name: '確認用集計の集計名', exact: true })).toHaveValue('確認用集計');
  await expect(app.getByRole('textbox', { name: '確認用集計の表示名', exact: true })).toHaveValue('小計');
});

test('集計の新規登録に失敗しても集計名と表示名の入力を保持する', async ({ app, page }) => {
  await page.locator('#scenario').selectOption('save-failure');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '集計マスタ');
  await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
  const form = app.getByRole('form', { name: '集計の新規登録' });
  await form.getByRole('textbox', { name: '集計名', exact: true }).fill('未保存の集計');
  await form.getByRole('textbox', { name: '表示名', exact: true }).fill('未保存の表示');
  await form.getByRole('button', { name: '登録', exact: true }).click();
  await expect(app.getByRole('alert')).toContainText('テスト用の保存失敗');
  await expect(form.getByRole('textbox', { name: '集計名', exact: true })).toHaveValue('未保存の集計');
  await expect(form.getByRole('textbox', { name: '表示名', exact: true })).toHaveValue('未保存の表示');
  await expect(app.getByRole('table', { name: '未所属の科目・集計', exact: true })).not.toContainText('未保存の集計');
});
