import { test, expect, selectClassification } from './fixtures';
test('検索で表示中の同じ施策を選び直すと一次予算で開く',async({page,app})=>{
  await page.goto('/tests/ui/preview.html?data=full');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
  await app.getByRole('button',{name:'確定予算の手修正',exact:true}).click();
  await app.getByRole('tab',{name:'確定予算',exact:true}).click();
  await expect(app.getByRole('tab',{name:'確定予算',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(app.getByRole('spinbutton',{name:'売上高 4月の金額',exact:true}).first()).toHaveValue('120');
  await app.getByRole('button',{name:'施策を検索',exact:true}).click();
  const dialog=app.getByRole('dialog',{name:'施策を検索',exact:true});
  await dialog.getByRole('searchbox',{name:'施策名・備考・分類',exact:true}).fill('確定予算の手修正');
  await dialog.getByRole('button',{name:'確定予算の手修正',exact:true}).click();
  await expect(app.getByRole('tab',{name:'一次予算',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(app.getByRole('spinbutton',{name:'売上高 4月の金額',exact:true}).first()).toHaveValue('100');
});
for(const dataset of ['full','signed-categories-large']) for(const screen of ['施策一覧','展開表']) for(const kind of ['一次予算','確定予算']){
  test(`${dataset}の${screen}から${kind}を引き継いで詳細を開く`,async({page,app})=>{
    await page.goto(`/tests/ui/preview.html?data=${dataset}`);
    await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:screen,exact:true}).click();
    const slot=app.getByRole('spinbutton',{name:screen==='施策一覧'?'種別':'比較対象1',exact:true});
    await selectClassification(slot,kind);
    const source=dataset==='full'?app.getByRole('button',{name:'確定予算の手修正',exact:true}):app.locator('.initiative-name-button').first();
    await source.click();
    await expect(app.getByRole('tab',{name:kind,exact:true})).toHaveAttribute('aria-selected','true');
    if(dataset==='full') await expect(app.getByRole('spinbutton',{name:'売上高 4月の金額',exact:true}).first()).toHaveValue(kind==='一次予算'?'100':'120');
    await app.getByRole('button',{name:'前の画面に戻る',exact:true}).click();
    await expect(app.getByRole('heading',{name:screen,exact:true})).toBeVisible();
    await expect(slot).toHaveAttribute('aria-valuetext',kind);
    await app.getByRole('button',{name:'次の画面に進む',exact:true}).click();
    await expect(app.getByRole('tab',{name:kind,exact:true})).toHaveAttribute('aria-selected','true');
  });
}
for(const first of ['一次予算','確定予算']) test(`両種別の展開表は比較対象1の${first}から詳細を開く`,async({page,app})=>{
  await page.goto('/tests/ui/preview.html');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'展開表',exact:true}).click();
  await selectClassification(app.getByRole('spinbutton',{name:'比較対象1',exact:true}),first);
  await selectClassification(app.getByRole('spinbutton',{name:'比較対象2',exact:true}),first==='一次予算'?'確定予算':'一次予算');
  await app.getByRole('button',{name:'確定予算の手修正',exact:true}).click();
  await expect(app.getByRole('tab',{name:first,exact:true})).toHaveAttribute('aria-selected','true');
  await app.getByRole('button',{name:'施策を検索',exact:true}).click();
  const dialog=app.getByRole('dialog',{name:'施策を検索',exact:true});
  await dialog.getByRole('searchbox',{name:'施策名・備考・分類',exact:true}).fill('確定予算の手修正');
  await dialog.getByRole('button',{name:'確定予算の手修正',exact:true}).click();
  await expect(app.getByRole('tab',{name:'一次予算',exact:true})).toHaveAttribute('aria-selected','true');
});
