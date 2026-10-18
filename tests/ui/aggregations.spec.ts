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
  await expect(sign('費用科目2')).toBeDisabled();
  const paths = await app.locator('.aggregation-tray-outlines path').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-group-id')));
  await app.getByRole('button', { name: 'ファイルを閉じる', exact: true }).click();
  await app.getByRole('alertdialog', { name: 'ファイルを閉じる', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await master(app, '集計マスタ');
  await expect(sign('費用集計')).toHaveAttribute('aria-pressed', 'true');
  await expect(sign('費用科目2')).toBeDisabled();
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
