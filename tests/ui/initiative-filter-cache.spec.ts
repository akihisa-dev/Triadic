import { test, expect } from '@playwright/test';
for(const count of [500,5000]) test(`絞り込み後の${count}施策をスクロールしても全件選別を再実行しない`,async({page})=>{
  test.setTimeout(60000);
  await page.goto(`/tests/ui/initiative-list-focus.html?count=${count}`);
  const table=page.getByRole('table',{name:'施策一覧',exact:true});
  const container=page.getByRole('region',{name:'施策一覧の月別売上・費用・利益',exact:true});
  const filter=table.getByRole('button',{name:/^施策名を絞り込む/});
  await filter.click();await page.getByLabel('含む文字',{exact:true}).fill('施策');
  await page.getByRole('button',{name:'適用',exact:true}).click();
  await expect(table.locator('tfoot')).toContainText('表示中の合計');
  const total=await table.locator('tfoot').innerText();
  await page.evaluate(()=>{
    const original=String.prototype.normalize;
    Reflect.set(window,'filterNormalizations',0);Reflect.set(window,'originalNormalize',original);
    String.prototype.normalize=function(this:string,...args:Parameters<typeof original>){Reflect.set(window,'filterNormalizations',Reflect.get(window,'filterNormalizations')+1);return original.apply(this,args);};
  });
  try{
    await container.evaluate(node=>{node.scrollTop=node.scrollHeight;});
    await expect(table.getByRole('button',{name:`施策${String(count-1).padStart(3,'0')}`,exact:true})).toBeAttached();
    expect(await page.evaluate(()=>Reflect.get(window,'filterNormalizations'))).toBe(0);
    expect(await table.locator('tfoot').innerText()).toBe(total);
    await filter.click();await page.getByLabel('含む文字',{exact:true}).fill('施策000');await page.getByRole('button',{name:'適用',exact:true}).click();
    await expect(table.locator('tbody tr[aria-rowindex]')).toHaveCount(1);
    expect(await page.evaluate(()=>Reflect.get(window,'filterNormalizations'))).toBeGreaterThan(0);
    expect(await table.locator('tfoot').innerText()).not.toBe(total);
  }finally{await page.evaluate(()=>{String.prototype.normalize=Reflect.get(window,'originalNormalize');});}
});
