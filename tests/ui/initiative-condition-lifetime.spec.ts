import {test,expect} from './runtime-errors';
import {settleMotion} from './fixtures';
import type {Page} from '@playwright/test';
async function navigate(page:Page,name:string){await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name,exact:true}).click();await settleMotion(page.locator('body'));}
test('検索からの詳細・別画面・詳細の複製を経ても一覧条件を保持し、ファイル終了で破棄する',async({page})=>{
  test.setTimeout(60000);await page.goto('/tests/ui/multi-window.html');await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await navigate(page,'施策一覧');
  const table=page.getByRole('table',{name:'施策一覧',exact:true});
  await table.getByRole('button',{name:'展開名を絞り込む',exact:true}).click();await page.getByLabel('すべて選択',{exact:true}).uncheck();await page.getByLabel('コスト',{exact:true}).check();await page.getByRole('button',{name:'適用',exact:true}).click();
  const sort=table.getByRole('button',{name:'施策名',exact:true});await sort.click();await sort.click();
  const names=await table.locator('tbody .initiative-name-button').allTextContents();expect(names.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'施策を検索',exact:true}).click();const search=page.locator('.initiative-search-dialog');await search.locator('input').fill('通信運搬費と消耗品費の削減');await search.getByRole('button',{name:'通信運搬費と消耗品費の削減',exact:true}).click();
  const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'ウィンドウを複製',exact:true}).click();const copy=await popup;
  for(const target of [page,copy]){
    await target.getByRole('button',{name:'← 施策一覧へ戻る',exact:true}).click();const list=target.getByRole('table',{name:'施策一覧',exact:true});
    await expect(list.locator('tbody .initiative-name-button')).toHaveText(names);await expect(list.locator('th[aria-sort="descending"]')).toHaveCount(1);
    await navigate(target,'マスタ');await navigate(target,'施策一覧');await expect(list.locator('tbody .initiative-name-button')).toHaveText(names);
  }
  await copy.getByRole('button',{name:'展開名を絞り込む（適用中）',exact:true}).click();await copy.getByRole('button',{name:'解除',exact:true}).click();
  await expect(table.locator('tbody .initiative-name-button')).toHaveText(names);
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('alertdialog',{name:'閉じる',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await navigate(page,'施策一覧');
  await expect(table.locator('th[aria-sort]')).toHaveCount(0);await expect(table.getByRole('button',{name:'展開名を絞り込む（適用中）',exact:true})).toHaveCount(0);
  expect(await table.locator('tbody .initiative-name-button').count()).toBeGreaterThan(names.length);
});
