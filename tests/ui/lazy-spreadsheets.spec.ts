import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMemoryFiles } from './memory-files';
const openProduction = async (page: import('@playwright/test').Page) => {
  await page.goto('/Triadichrome-extension/index.html');
  await page.evaluate(installMemoryFiles, {bytes:[...await readFile('samples/全機能確認用.triadic')],scenario:'normal' as const});
  await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
};
const navigate=async(page:import('@playwright/test').Page,name:string)=>{
  const toggle=page.getByRole('button',{name:'サイドバーを開く',exact:true});
  if(await toggle.isVisible())await toggle.click();
  await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name,exact:true}).click();
};
test('Excelは初回入出力だけで読み込み、読み込み途中でも他画面へ移動できる',async({page})=>{
  let requested=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/SpreadsheetIOPage-*.js',async route=>{requested++;await gate;await route.continue();});
  await openProduction(page);expect(requested).toBe(0);
  await navigate(page,'入出力');await expect(page.getByRole('status').filter({hasText:'読み込み中'})).toBeVisible();
  await navigate(page,'Home');await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
  release();await navigate(page,'入出力');await expect(page.getByRole('button',{name:'選んだ表を出力',exact:true})).toBeVisible();
  expect(requested).toBe(1);
  await navigate(page,'施策一覧');await expect(page.getByRole('heading',{name:'施策一覧',exact:true})).toBeVisible();
});
test('入出力コードの読込失敗で計画を保持し、再読込後に開き直せる',async({page})=>{
  let requests=0;
  await page.route('**/SpreadsheetIOPage-*.js',async route=>{requests++;if(requests===1)await route.abort();else await route.continue();});
  await openProduction(page);await navigate(page,'入出力');
  await expect(page.getByRole('alert')).toContainText('保存済みの計画は保持');
  await navigate(page,'総原価表');await expect(page.getByRole('table',{name:'総原価表',exact:true})).toBeVisible();
  await navigate(page,'入出力');await expect(page.getByRole('alert')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'画面を再読み込み',exact:true}).click();
  await openProduction(page);await navigate(page,'入出力');
  await expect(page.getByRole('button',{name:'選んだ表を出力',exact:true})).toBeVisible();
  expect(requests).toBe(2);
  await navigate(page,'総原価表');await expect(page.getByRole('table',{name:'総原価表',exact:true})).toBeVisible();
});
