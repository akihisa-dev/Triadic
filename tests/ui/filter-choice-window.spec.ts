import {test,expect} from '@playwright/test';
test('10000候補は表示範囲だけ描画し、全選択・末尾・検索・Tabと選択条件を保つ',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/tests/ui/history-window.html');await page.getByRole('button',{name:'記録日時を絞り込む',exact:true}).click();
  const panel=page.locator('.table-filter-panel'),list=panel.locator('.table-filter-options'),boxes=list.getByRole('checkbox');
  await expect.poll(()=>boxes.count()).toBeLessThan(80);expect(await boxes.count()).toBeGreaterThan(0);
  const first=await list.locator('label').first().innerText();
  await page.evaluate(()=>{const original=Array.prototype.includes;Reflect.set(window,'choiceScans',0);Reflect.set(window,'choiceIncludes',original);Array.prototype.includes=function(...args){if(this.length>5000)Reflect.set(window,'choiceScans',Reflect.get(window,'choiceScans')+1);return original.apply(this,args);};});
  try {
    await boxes.first().uncheck();await expect(panel.getByLabel('すべて選択',{exact:true})).not.toBeChecked();
    expect(await page.evaluate(()=>Reflect.get(window,'choiceScans'))).toBe(0);
    await list.evaluate(node=>{node.scrollTop=node.scrollHeight;});await expect(list.locator('tr[data-window-row="9999"]')).toBeVisible();
    const last=await list.locator('label').last().innerText();await expect(list.getByLabel(last,{exact:true})).toBeChecked();await list.getByLabel(last,{exact:true}).uncheck();
    const search=panel.getByLabel('候補を検索',{exact:true});await search.fill(first);await expect(boxes).toHaveCount(1);await expect(boxes).not.toBeChecked();
    await boxes.check();await search.fill(last);await expect(boxes).not.toBeChecked();
    await search.fill('');await search.press('Tab');await page.keyboard.press('Tab');
    for(let index=0;index<45;index++)await page.keyboard.press('Tab');
    await expect.poll(()=>list.evaluate(node=>node.contains(document.activeElement))).toBe(true);
    await expect.poll(()=>list.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    await panel.getByRole('button',{name:'適用',exact:true}).click();
    await page.getByLabel('表示中の履歴をすべて選択',{exact:true}).check();await page.getByRole('button',{name:'選択した履歴を削除',exact:true}).click();
    await expect(page.getByRole('alertdialog')).toContainText('9999件');
    await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  } finally {await page.evaluate(()=>{Array.prototype.includes=Reflect.get(window,'choiceIncludes');});}
});
