import { test, expect, settleMotion } from './fixtures';

test('L字に収まらない縦書き名だけを隠し、横書きの行名と配置を保って高さが増えたら戻す', async ({ app, page }, testInfo) => {
  await app.getByRole('button', { name: '新規作成', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await app.getByRole('button', { name: 'マスタ', exact: true }).click();
  await app.getByRole('button', { name: /^集計マスタ/ }).click();
  await app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).first().click();
  await settleMotion(app.locator('body'));
  const table = app.getByRole('table', { name: '集計マスタ', exact: true });
  const pool = app.getByRole('complementary', { name: '未所属プール', exact: true });
  const name = '高さ不足確認集計';
  await app.getByRole('button', { name: '＋ 集計を追加', exact: true }).click();
  await app.getByRole('textbox', { name: '集計名', exact: true }).fill(name);
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(pool).toContainText(name);
  const move = async (source: string, target: string) => {
    await app.getByRole('button', { name: source + 'を移動', exact: true }).click();
    await app.getByRole('button', { name: target + 'を移動', exact: true }).click();
    await expect(app.getByRole('button', { name: source + 'を移動', exact: true })).toBeEnabled();
  };
  await move(name, '経常利益');
  await move('旅費', name);
  const group = table.getByRole('row').filter({ has: app.getByRole('button', { name: name + 'を移動', exact: true }) });
  await group.scrollIntoViewIfNeeded();
  const vertical = app.getByRole('button', { name: name + 'の範囲', exact: true }).locator('.aggregation-label-text');
  await expect(vertical).toBeHidden();
  await expect(group.getByRole('rowheader')).toHaveText(name);
  await expect(group.getByRole('button', { name: '加算', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const dimensions = await vertical.evaluate(node => ({ text: node.getBoundingClientRect().height, tray: node.parentElement!.getBoundingClientRect().height }));
  expect(dimensions.text).toBeGreaterThan(dimensions.tray);
  expect(dimensions.tray).toBe(62);
  const state = () => table.evaluate(node => ({
    rows: [...node.querySelectorAll('tr[data-row]')].map(row => [row.getAttribute('data-row'), row.getBoundingClientRect().height, row.querySelector('.master-sign-selector [aria-pressed="true"]')?.getAttribute('aria-label')]),
    paths: [...node.parentElement!.querySelectorAll('.aggregation-tray-outlines path')].map(path => path.getAttribute('d')),
  }));
  const before = await state();
  await app.getByRole('region', { name: '集計の構成', exact: true }).evaluate(node => { node.scrollTop -= 31; });
  await settleMotion(app.locator('body'));
  await expect(vertical).toBeHidden();
  expect(await state()).toEqual(before);
  await expect(pool.locator('tr[data-pool-row]')).toHaveCount(0);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/private/tmp/triadic-short-label.png' });
  await move('管理可能費小計', name);
  await group.scrollIntoViewIfNeeded();
  await expect(vertical).toBeVisible();
  const fit = await vertical.evaluate(node => {
    const text = node.getBoundingClientRect(), tray = node.parentElement!.getBoundingClientRect();
    return { text: { top: text.top, bottom: text.bottom, height: text.height }, tray: { top: tray.top, bottom: tray.bottom, height: tray.height } };
  });
  expect(fit.text.height).toBeLessThanOrEqual(fit.tray.height);
  expect(fit.text.top).toBeGreaterThanOrEqual(fit.tray.top);
  expect(fit.text.bottom).toBeLessThanOrEqual(fit.tray.bottom);
  await expect(group.getByRole('rowheader')).toHaveText(name);
  await expect(group.getByRole('button', { name: '加算', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
