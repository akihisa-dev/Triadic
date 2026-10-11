import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const sample=Array.from(await readFile(new URL('../../samples/全機能確認用.triadic',import.meta.url)));
test('入口ではSQLiteを準備せず、Worker起動失敗後の再選択でファイルを開く',async({page})=>{
 const wasm:string[]=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname.endsWith('.wasm')&&!url.searchParams.has('import'))wasm.push(request.url());});
 await page.goto('/');await expect(page.getByRole('button',{name:'ファイルを開く',exact:true})).toBeEnabled();
 expect(wasm).toEqual([]);
 await page.evaluate(async bytes=>{
  const handle=await(await navigator.storage.getDirectory()).getFileHandle('初期化確認.triadic',{create:true});const writer=await handle.createWritable();await writer.write(new Uint8Array(bytes));await writer.close();
  Object.assign(window,{entryHandle:handle});Object.defineProperty(window,'showOpenFilePicker',{configurable:true,value:async()=>[handle]});
 },sample);
 let failures=0;await page.route(/planProcessing\.worker\.ts/,async route=>{if(failures++===0)await route.abort();else await route.continue();});
 await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('データの処理を続けられませんでした');
 await expect(page.locator('#recent-file-name')).toHaveText('まだ開いていません');
 expect(await page.evaluate(async()=>Array.from(new Uint8Array(await(await(Reflect.get(window,'entryHandle') as FileSystemFileHandle).getFile()).arrayBuffer())))).toEqual(sample);
 await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
 await expect(page.locator('.home-file-name')).toHaveText('初期化確認.triadic');
 expect(failures).toBe(2);expect(wasm).toHaveLength(1);
});
