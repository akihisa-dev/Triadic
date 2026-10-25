import {test,expect,settleMotion,openInitiativeEntry,selectAccount,selectClassification} from './fixtures';
for(const surface of ['entry','detail','previous']) test(`${surface}は範囲末尾でなく実際のフォーカス先をF2と直接入力で編集する`,async({page,app})=>{
  await page.setViewportSize({width:Math.max(600,page.viewportSize()!.width),height:1400});
  await page.goto('/tests/ui/preview.html'); await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  if(surface==='previous'){
    await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'前年入力',exact:true}).click();
    await selectClassification(app.getByRole('combobox',{name:'部署名',exact:true}),'部署A');
    await selectClassification(app.getByRole('combobox',{name:'業種名',exact:true}),'直営自動車');
  }else if(surface==='entry'){
    await openInitiativeEntry(app); await settleMotion(app.locator('body'));
    await selectAccount(app.getByRole('combobox',{name:'1行目の勘定科目',exact:true}),'1');
  }else{
    await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
    await app.getByRole('button',{name:'既存商品の販売拡大',exact:true}).click();
  }
  await settleMotion(app.locator('body'));
  const table=app.getByRole('table',{name:surface==='previous'?'前年入力の月別金額':'月別金額',exact:true});
  const first=table.locator('input[data-row="0"][data-column="0"]'),last=table.locator('input[data-row="0"][data-column="1"]');
  await first.fill('1234.567');await first.press('Tab');const lastValue=await last.inputValue();await first.focus();
  const a=(await first.boundingBox())!,b=(await last.boundingBox())!;
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
  const selected=table.locator('td.initiative-cell-selected,td.previous-cell-selected');
  const selectedCount=await selected.count();expect(selectedCount).toBeGreaterThan(1);
  await expect(first).toBeFocused();await page.keyboard.press('F2');
  await expect(first.locator('..').locator('.grid-amount-display')).toHaveCount(0);
  await expect(last.locator('..').locator('.grid-amount-display')).toBeVisible();
  await expect(selected).toHaveCount(selectedCount);
  await first.fill('9876.543');await first.press('Escape');await expect(first).toHaveValue('1234.567');await expect(last).toHaveValue(lastValue);
  await first.press('F2');await first.press('End');await first.press('Backspace');await first.press('9');await expect(first).toHaveValue('1234.569');
});
