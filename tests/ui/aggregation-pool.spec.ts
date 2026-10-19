import { test, expect, settleMotion } from './fixtures';

test('新規科目と新規集計を右側にプールし、掴んで所属させて解除・再読込できる', async ({ app, page }, testInfo) => {
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^勘定科目マスタ/ }).click();
  await app.getByRole('textbox', { name: '科目コード', exact: true }).fill('900');
  await app.getByRole('textbox', { name: '名称', exact: true }).fill('追加した科目');
  await app.getByRole('combobox', { name: '科目属性', exact: true }).selectOption('expense');
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(app.getByRole('button', { name: '追加した科目を編集', exact: true })).toBeEnabled();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  await app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).first().click();
  await settleMotion(app.locator('body'));
  const table = app.getByRole('table', { name: '集計マスタ', exact: true });
  const pool = app.getByRole('complementary', { name: '未所属プール', exact: true });
  await expect(pool).toContainText('追加した科目');
  await expect(table).not.toContainText('追加した科目');
  await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '集計名', exact: true }).fill('追加した集計');
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(pool).toContainText('追加した集計');
  await expect(table.locator('tr[data-row]')).toHaveCount(4);
  const placement = await pool.evaluate(node => {
    const table = node.closest('main')!.querySelector('.aggregation-grid-scroll')!.getBoundingClientRect();
    return { tableRight: table.right, poolLeft: node.getBoundingClientRect().left };
  });
  expect(placement.poolLeft).toBeGreaterThan(placement.tableRight);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/private/tmp/triadichrome-aggregation-pool.png' });

  // Cancelling a drag must keep the new item in the pool and leave the table untouched.
  await pool.getByRole('button', { name: '追加した科目を移動', exact: true }).click();
  await pool.getByRole('button', { name: '追加した科目を移動', exact: true }).press('Escape');
  await expect(table.locator('tr[data-row]')).toHaveCount(4);
  await expect(pool).toContainText('追加した科目');

  const ordinary = table.getByRole('row').filter({ has: app.getByRole('button', { name: '経常利益を移動', exact: true }) });
  await pool.getByRole('button', { name: '追加した集計を移動', exact: true }).dragTo(ordinary.getByRole('rowheader'), { targetPosition: { x: 10, y: 20 } });
  await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  await expect(pool).not.toContainText('追加した集計');
  const group = table.getByRole('row').filter({ has: app.getByRole('button', { name: '追加した集計を移動', exact: true }) });
  await expect(group).toBeVisible();
  await pool.getByRole('button', { name: '追加した科目を移動', exact: true }).dragTo(group.getByRole('rowheader'), { targetPosition: { x: 10, y: 20 } });
  await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  await expect(pool.locator('tr[data-pool-row]')).toHaveCount(0);
  const account = table.getByRole('row').filter({ has: app.getByRole('button', { name: '追加した科目を移動', exact: true }) });
  await expect(account.getByRole('button', { name: '加算', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await account.getByRole('button', { name: '追加した科目を移動', exact: true }).dragTo(pool.getByRole('heading', { name: /^未所属/ }));
  await expect(app.locator('.aggregation-floating-row')).toHaveCount(0);
  await expect(pool).toContainText('追加した科目');
  await expect(table).not.toContainText('追加した科目');
  await expect(group).toBeVisible(); // A placed, empty child group stays in its saved position.
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを閉じる', exact: true }).click();
  await app.getByRole('alertdialog', { name: 'ファイルを閉じる', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  await expect(pool).toContainText('追加した科目');
  await expect(table).toContainText('追加した集計');
  await expect(table).not.toContainText('追加した科目');
});
