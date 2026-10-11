import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const sample = Array.from(await readFile(new URL('../../samples/全機能確認用.triadic', import.meta.url)));
async function picker(page: import('@playwright/test').Page) {
 await page.evaluate(async bytes => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle('一括読込.triadic', {create:true});
  const writer = await handle.createWritable(); await writer.write(new Uint8Array(bytes)); await writer.close();
  Object.assign(window, {openHandle:handle});
  Object.defineProperty(window,'showOpenFilePicker',{value:async()=>[handle],configurable:true});
 },sample);
}
test.beforeEach(async ({page}) => {
 await page.addInitScript(() => {
  const tasks: {task:string;details:unknown}[] = [];
  Object.assign(window,{openTasks:tasks,failNextOpen:false});
  const Native = Worker;
  window.Worker = class extends Native {
   override postMessage(message: {task:string;args:unknown[]}) {
    tasks.push({task:message.task,details:message.args[1]});
    if (message.task==='readSavedPlan' && Reflect.get(window,'failNextOpen')) {
     Reflect.set(window,'failNextOpen',false); queueMicrotask(()=>this.dispatchEvent(new Event('error'))); return;
    }
    super.postMessage(message);
   }
  };
 });
 await page.goto('/');
 await expect(page.getByRole('button',{name:'ファイルを開く',exact:true})).toBeEnabled();
 await picker(page);
});
for (const method of ['通常選択','続きから','ドロップ']) test(`${method}は計画と履歴を一つの依頼で読み込む`,async({page})=>{
 if(method==='続きから') {
  await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await expect(page.locator('.home-file-name')).toHaveText('一括読込.triadic');
  await page.reload(); await expect(page.locator('#recent-file-name')).toHaveText('一括読込.triadic');
  await page.getByRole('button',{name:'続きから',exact:true}).click();
 } else if(method==='ドロップ') {
  await page.locator('.entry-open-section').evaluate(async node=>{
   const handle = Reflect.get(window,'openHandle') as FileSystemFileHandle;
   const data = new DataTransfer(); data.items.add(await handle.getFile());
   Object.defineProperty(DataTransferItem.prototype,'getAsFileSystemHandle',{configurable:true,value:async()=>handle});
   node.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));
  });
 } else await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
 await expect(page.locator('.home-file-name')).toHaveText('一括読込.triadic');
 expect(await page.evaluate(()=>Reflect.get(window,'openTasks'))).toEqual([{task:'readSavedPlan',details:false}]);
 await page.getByRole('button',{name:'履歴',exact:true}).click();
 await expect(page.getByRole('heading',{name:'履歴',exact:true})).toBeVisible();
});
test('Worker失敗では参照と元ファイルを保持し、次の選択で再作成して開く',async({page})=>{
 await page.evaluate(()=>Reflect.set(window,'failNextOpen',true));
 await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('データの処理を続けられませんでした');
 await expect(page.locator('#recent-file-name')).toHaveText('まだ開いていません');
 expect(await page.evaluate(async()=>Array.from(new Uint8Array(await (await (Reflect.get(window,'openHandle') as FileSystemFileHandle).getFile()).arrayBuffer())))).toEqual(sample);
 await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
 await expect(page.locator('.home-file-name')).toHaveText('一括読込.triadic');
 expect(await page.evaluate(()=>Reflect.get(window,'openTasks'))).toEqual([{task:'readSavedPlan',details:false},{task:'readSavedPlan',details:false}]);
});
