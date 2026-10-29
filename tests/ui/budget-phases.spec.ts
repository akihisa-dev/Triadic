import { test, expect, settleMotion } from './fixtures';

async function selectPhase(app: import('@playwright/test').FrameLocator, name: string) {
  await app.getByRole('main', { name: '作業を選択', exact: true }).getByRole('button', { name, exact: true }).click();
  await expect(app.getByRole('heading', { name: '施策一覧', exact: true })).toBeVisible();
}

test('各フェーズで入力タブ・前年・三表の比較対象を揃える', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  for (const name of ['一次予算', '確定予算']) {
    await selectPhase(app, name);
    await expect(app.getByLabel('予算フェーズ', { exact: true })).toHaveText(name);
    const nav = app.getByRole('navigation', { name: 'メインナビゲーション' });
    if (name === '確定予算') {
      const kind = app.getByRole('spinbutton', { name: '種別', exact: true });
      await kind.press('Home');
      await expect(kind).toHaveAttribute('aria-valuetext', '一次予算');
    }
    await app.getByRole('button', { name: '既存商品の販売拡大', exact: true }).click();
    await expect(app.getByRole('tab')).toHaveCount(1);
    await expect(app.getByRole('tab', { name, exact: true })).toBeVisible();
    await expect(app.getByRole('spinbutton', { name: '売上高 4月の金額', exact: true }).first()).toBeEnabled();
    await nav.getByRole('button', { name: '前年入力', exact: true }).click();
    await expect(app.getByRole('heading', { name: '前年入力', exact: true })).toBeVisible();
    await expect(app.locator('.previous-input-page').getByText(name === '一次予算' ? '前年見込' : '前年実績', { exact: true })).toBeVisible();
    await expect(app.locator('#previous-input-kind')).toHaveCount(0);
    for (const table of ['総原価表', '展開表']) {
      await nav.getByRole('button', { name: table, exact: true }).click();
      const comparison = app.getByRole('group', { name: '予算の比較条件', exact: true });
      await expect(comparison.getByRole('checkbox')).toHaveCount(name === '一次予算' ? 1 : 2);
      await expect(comparison.getByText(name === '一次予算' ? '前年見込' : '前年実績', { exact: true })).toBeVisible();
      await expect(comparison.getByRole('checkbox', { name: '一次予算を表示', exact: true })).toBeChecked();
      if (name === '確定予算') await expect(comparison.getByRole('checkbox', { name: '確定予算を表示', exact: true })).toBeChecked();
    }
    await nav.getByRole('button', { name: '作業を選択', exact: true }).click();
  }
});

test('確定で新規追加した施策は一次の一覧・検索・展開表へ出ず、再読込しても保持する', async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await selectPhase(app, '確定予算');
  await app.getByRole('button', { name: '既存商品の販売拡大', exact: true }).click();
  await app.getByRole('button', { name: '複製して新規作成', exact: true }).click();
  await app.getByRole('textbox', { name: '施策名', exact: true }).fill('確定からの追加');
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(app.getByRole('button', { name: '確定からの追加', exact: true })).toBeVisible();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '作業を選択', exact: true }).click();
  await app.getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await selectPhase(app, '一次予算');
  await expect(app.getByRole('button', { name: '確定からの追加', exact: true })).toHaveCount(0);
  const nav = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await nav.getByRole('button', { name: '展開表', exact: true }).click();
  await expect(app.getByRole('button', { name: '確定からの追加', exact: true })).toHaveCount(0);
  await app.getByRole('button', { name: '施策を検索', exact: true }).click();
  await app.getByRole('searchbox').fill('確定からの追加');
  await expect(app.getByText('条件に一致する施策はありません。', { exact: true })).toBeVisible();
  await app.getByRole('searchbox').press('Escape');
  await settleMotion(app.locator('body'));
  await nav.getByRole('button', { name: '作業を選択', exact: true }).click();
  await selectPhase(app, '確定予算');
  await expect(app.getByRole('button', { name: '確定からの追加', exact: true })).toBeVisible();
});
