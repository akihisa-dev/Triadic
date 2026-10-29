import {test,expect} from './runtime-errors';
import {settleMotion} from './fixtures';
for(const viewport of [{width:375,height:450},{width:1280,height:450},{width:375,height:800}])test(`${viewport.width}x${viewport.height}で勘定科目と履歴の末尾を操作し、登録欄にも戻れる`,{tag:'@fixed-viewport'},async({page},info)=>{
  await page.setViewportSize(viewport);await page.goto('/tests/ui/multi-window.html');await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'マスタ',exact:true}).click();await page.getByRole('button',{name:/^勘定科目マスタ/}).click();
  const close=page.getByRole('button',{name:'サイドバーを閉じる',exact:true}).first();if(await close.isVisible())await close.click();await settleMotion(page.locator('body'));
  const list=page.locator('.unified-master-page .account-master-list');expect(await list.evaluate(node=>node.clientHeight)).toBeGreaterThanOrEqual(158);
  await list.getByRole('button',{name:'科目コードを絞り込む',exact:true}).click();await expect(page.locator('.table-filter-panel')).toBeVisible();await page.keyboard.press('Escape');
  await list.getByRole('button',{name:'名称',exact:true}).click();await expect(list.locator('th[aria-sort="ascending"]')).toHaveCount(1);
  const row=list.locator('tbody tr').last();await row.locator('button[data-edit]').click();await expect(row.getByRole('button',{name:'完了',exact:true})).toBeVisible();await row.getByRole('button',{name:'完了',exact:true}).click();
  await page.locator('.unified-master-page').evaluate(node=>{node.scrollTop=0;});await page.locator('.account-master-form input').first().focus();await expect(page.locator('.account-master-form input').first()).toBeFocused();
  await page.screenshot({path:info.outputPath('account.png')});
  await page.getByRole('button',{name:'サイドバーを開く',exact:true}).click();await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'履歴',exact:true}).click();
  const closeHistory=page.getByRole('button',{name:'サイドバーを閉じる',exact:true}).first();if(await closeHistory.isVisible())await closeHistory.click();await settleMotion(page.locator('body'));
  const history=page.locator('.data-history-list');expect(await history.evaluate(node=>node.clientHeight)).toBeGreaterThanOrEqual(160);
  await history.getByRole('button',{name:'記録日時',exact:true}).click();await history.getByRole('button',{name:'記録日時を絞り込む',exact:true}).click();await expect(page.locator('.table-filter-panel')).toBeVisible();await page.keyboard.press('Escape');
  const last=history.getByRole('button',{name:/と現在の差分$/}).last();await last.click();const dialog=page.locator('.history-difference-dialog');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(last).toBeFocused();await page.screenshot({path:info.outputPath('history.png')});
});
