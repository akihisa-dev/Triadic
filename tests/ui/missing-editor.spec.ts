import { test, expect } from '@playwright/test';
for (const screen of ['previous', 'named', 'account']) test(`${screen}の対象消失後も元の欄から入力を回収できる`, async ({ page }) => {
  await page.goto(`/tests/ui/missing-editor.html?screen=${screen}`);
  let field;
  if (screen === 'previous') {
    await page.getByRole('combobox', { name: '部署名', exact: true }).selectOption({ label: '保持元部署' });
    field = page.getByRole('textbox', { name: '売上高 4月の前年金額', exact: true });
    await field.fill('123.456');
  } else {
    await page.getByRole('button', { name: screen === 'named' ? '保持元期間を編集' : '保持元科目を編集', exact: true }).click();
    field = page.getByRole('textbox', { name: screen === 'named' ? '保持元期間の期間名' : '保持元科目の名称', exact: true });
    await field.fill('回収する未保存入力');
  }
  await expect(page.getByRole('alert')).toContainText('確認用の保存失敗');
  const attempts = await page.getByLabel('保存試行回数').innerText();
  await page.getByRole('button', { name: '別画面で対象を削除', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('編集対象が削除されています');
  await expect(field).toHaveValue(screen === 'previous' ? '123.456' : '回収する未保存入力');
  await expect(field).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: '保存を再試行', exact: true })).toBeDisabled();
  if (screen === 'previous') await expect(page.getByRole('combobox', { name: '部署名', exact: true }).locator('option:checked')).toHaveText('保持元部署');
  await field.press('ControlOrMeta+a'); await field.press('ControlOrMeta+c');
  await page.getByRole('button', { name: '別画面で対象を再登録', exact: true }).click();
  await expect(field).toHaveValue(screen === 'previous' ? '123.456' : '回収する未保存入力');
  await expect(page.getByLabel('保存試行回数')).toHaveText(attempts);
  await page.getByRole('button', { name: '入力を取り消す', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存を再試行', exact: true })).toHaveCount(0);
  if (screen === 'previous') await expect(page.getByRole('combobox', { name: '部署名', exact: true })).toBeEnabled();
  else {
    if (screen === 'named') {
      await expect(page.getByRole('textbox', { name: '作り直した期間の期間名', exact: true })).toHaveValue('作り直した期間');
      await page.getByRole('button', { name: '完了', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: screen === 'named' ? '作り直した期間を編集' : '作り直した科目を編集', exact: true })).toBeEnabled();
  }
});


test('集計の対象消失後は入力を回収でき、同番号の再登録へ転用しない', async ({ page }) => {
  await page.goto('/tests/ui/missing-editor.html?screen=aggregation');
  await page.getByRole('rowheader', { name: '保持元集計', exact: true }).dblclick();
  await page.getByRole('textbox', { name: '保持元集計の集計名', exact: true }).fill('回収する未保存入力');
  await expect(page.getByRole('alert')).toContainText('確認用の保存失敗');
  const attempts = await page.getByLabel('保存試行回数').innerText();
  await page.getByRole('button', { name: '別画面で対象を削除', exact: true }).click();
  const retained = page.getByLabel('保持している集計の入力', { exact: true });
  const input = retained.getByRole('textbox', { name: '集計名', exact: true });
  await expect(input).toHaveValue('回収する未保存入力');
  await expect(input).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: '保存を再試行', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '別画面で対象を再登録', exact: true }).click();
  await expect(input).toHaveValue('回収する未保存入力');
  await expect(page.getByLabel('保存試行回数')).toHaveText(attempts);
  await page.getByRole('button', { name: '入力を取り消す', exact: true }).click();
  await expect(retained).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '作り直した集計の集計名', exact: true })).toHaveValue('作り直した集計');
});
