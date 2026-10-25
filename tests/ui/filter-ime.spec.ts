import { test, expect } from './fixtures';

test('文字・候補の検索は変換中と変換終端のEnterを無視し、次の通常Enterで適用する', async ({page,app}) => {
  await page.goto('/tests/ui/preview.html?data=full'); await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
  await app.getByRole('button',{name:'施策名を絞り込む',exact:true}).click();
  const panel=app.locator('.table-filter-panel'), input=panel.getByLabel('含む文字',{exact:true}); await input.fill('通信');
  for (const event of [{isComposing:true,keyCode:13},{isComposing:false,keyCode:229}]) {
    await input.dispatchEvent('keydown',{key:'Enter',bubbles:true,...event}); await expect(panel).toBeVisible();
    await expect(app.getByRole('button',{name:'施策名を絞り込む（適用中）',exact:true})).toHaveCount(0);
  }
  await input.press('Enter'); await expect(panel).toHaveCount(0);
  await expect(app.getByRole('table',{name:'施策一覧',exact:true}).locator('tbody .initiative-name-button')).toHaveCount(1);
  await app.getByRole('button',{name:'施策名を絞り込む（適用中）',exact:true}).click(); await input.press('Escape'); await expect(panel).toHaveCount(0);
  await page.route('**/favicon.ico', route => route.fulfill({status:204}));
  await page.goto('/tests/ui/history-window.html'); await page.getByRole('button',{name:'記録日時を絞り込む',exact:true}).click();
  const search=page.getByLabel('候補を検索',{exact:true}); await search.fill('2026');
  await search.dispatchEvent('keydown',{key:'Enter',keyCode:229,isComposing:false,bubbles:true}); await expect(page.locator('.table-filter-panel')).toBeVisible();
  await search.press('Enter'); await expect(page.locator('.table-filter-panel')).toHaveCount(0);
});
