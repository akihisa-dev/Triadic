import { test, expect } from './fixtures';

test('全比較画面で列ごとの前年排他・最後の選択・結果の見出しを保つ', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  const navigate = (name: string) => app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  for (const name of ['総原価表', '展開表', 'ダッシュボード', '入出力', '履歴']) {
    await navigate(name);
    if (name === '履歴') await app.getByRole('button', { name: /と現在の差分$/ }).last().click();
    const groups = app.getByRole('group', { name: '予算の比較条件', exact: true });
    await expect(groups).toHaveCount(name === '入出力' ? 2 : 1);
    for (let i = 0; i < await groups.count(); i++) {
      const group = groups.nth(i), boxes = group.getByRole('checkbox');
      await expect(boxes).toHaveCount(["総原価表", "展開表"].includes(name) ? 6 : 4);
      const primaryForecast = group.getByRole('checkbox', { name: '前年見込を基準にした一次予算', exact: true });
      const primaryActual = group.getByRole('checkbox', { name: '前年実績を基準にした一次予算', exact: true });
      const finalForecast = group.getByRole('checkbox', { name: '前年見込を基準にした確定予算', exact: true });
      const finalActual = group.getByRole('checkbox', { name: '前年実績を基準にした確定予算', exact: true });
      await expect(primaryForecast).toBeChecked();
      await primaryForecast.click();
      await expect(primaryForecast).toBeChecked();
      await primaryActual.click();
      await expect(primaryForecast).not.toBeChecked();
      await expect(primaryActual).toBeChecked();
      await finalForecast.click();
      await expect(primaryActual).toBeChecked();
      await expect(finalForecast).toBeChecked();
      if (name === '履歴') await expect(app.getByRole('dialog').getByRole('rowheader').first()).toHaveText('一次予算 · 前年実績基準');
      await finalActual.focus(); await finalActual.press('Space');
      await expect(finalActual).toBeChecked(); await expect(finalForecast).not.toBeChecked();
      await primaryForecast.click();
      await expect(primaryActual).not.toBeChecked(); await expect(finalActual).toBeChecked();
    }
    if (name === '総原価表' || name === '展開表') {
      const table = app.getByRole('table', { name, exact: true });
      await expect(table.getByRole('columnheader', { name: '前年見込', exact: true })).toHaveCount(19);
      await expect(table.getByRole('columnheader', { name: '一次予算', exact: true })).toHaveCount(19);
      await expect(table.getByRole('columnheader', { name: '確定予算', exact: true })).toHaveCount(19);
      await expect(table.getByRole('columnheader', { name: '差額', exact: true })).toHaveCount(19);
    }
    if (name === '履歴') {
      const dialog = app.getByRole('dialog');
      await expect(dialog.getByRole('table')).toContainText('一次予算 · 前年見込基準');
      await expect(dialog.getByRole('table')).toContainText('確定予算 · 前年実績基準');
      await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    }
  }
  await navigate('総原価表');
  await expect(app.getByRole('checkbox', { name: '前年実績を基準にした確定予算', exact: true })).toBeChecked();
});
