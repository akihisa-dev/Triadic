import { test, expect } from './fixtures';

for(const duringSave of [false,true])test(`前年の全セル入力と外部月額を保存${duringSave?'中':'後'}の編集でも保持`,async({page,app},testInfo)=>{
  await page.goto('/tests/ui/preview.html');await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate((_element,hold:boolean)=>{
    const target=window as Window & typeof globalThis & {showOpenFilePicker:()=>Promise<FileSystemFileHandle[]>;previousRebase?:{started:boolean;release:()=>void}};
    const picker=target.showOpenFilePicker.bind(target);
    Object.defineProperty(target,'showOpenFilePicker',{value:async()=>{
      const [handle]=await picker(),get=handle!.getFile.bind(handle),create=handle!.createWritable.bind(handle);
      const path='/Triadic-extension/src/core/storage/';
      const {readPlanContents}=await import(path+'readPlan.ts'),{savePreviousAmounts}=await import(path+'settings.ts');
      const base=new Uint8Array(await(await get()).arrayBuffer()),contents=await readPlanContents(base);
      const account=contents.accounts.find((item:{accountCode:string})=>item.accountCode==='401');
      const bytes=await savePreviousAmounts(base,{ previousKind: 1,industryId:1,departmentId:1,rows:[{accountId:account.id,amounts:{5:'777'}}]});
      let reads=0,committed=false;
      Object.defineProperty(handle,'getFile',{value:async()=>++reads>1&&!committed?new File([bytes],handle!.name):get()});
      Object.defineProperty(handle,'createWritable',{value:async()=>{
        const writer=await create(),close=writer.close.bind(writer);
        Object.defineProperty(writer,'close',{value:async()=>{
          if(hold&&!committed)await new Promise<void>(release=>{target.previousRebase={started:true,release};});
          await close();committed=true;
        }});return writer;
      }});return[handle!];
    }});
  },duringSave);
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  const nav=app.getByRole('navigation',{name:'メインナビゲーション'});
  await nav.getByRole('button',{name:'前年入力',exact:true}).click();
  await app.getByRole('combobox',{name:'部署名',exact:true}).selectOption('1');
  await app.getByRole('combobox',{name:'業種名',exact:true}).selectOption('1');
  const field=(month:number)=>app.getByRole('textbox',{name:`売上高 ${month}月の前年金額`,exact:true});
  await field(4).fill('1001');
  if(duringSave){
    await expect.poll(()=>app.locator('body').evaluate(()=>Boolean((window as Window & {previousRebase?:{started:boolean}}).previousRebase?.started))).toBe(true);
    await field(6).fill('1002');await app.locator('body').evaluate(()=>{(window as Window & {previousRebase?:{release:()=>void}}).previousRebase!.release();});
  }
  await expect(field(5)).toHaveValue('777');if(!duringSave)await field(6).fill('1002');
  await expect(nav.getByRole('button',{name:'Home',exact:true})).toBeEnabled();
  await nav.getByRole('button',{name:'Home',exact:true}).click();
  await expect(app.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
  await nav.getByRole('button',{name:'前年入力',exact:true}).click();
  await expect(app.getByRole('heading',{name:'前年入力',exact:true})).toBeVisible();
  await app.getByRole('combobox',{name:'部署名',exact:true}).selectOption('1');await app.getByRole('combobox',{name:'業種名',exact:true}).selectOption('1');
  await expect(field(4)).toHaveValue('1001');await expect(field(5)).toHaveValue('777');await expect(field(6)).toHaveValue('1002');
  const imagePath = testInfo.outputPath(`previous-rebase-${duringSave}.png`);
  await page.screenshot({ path: imagePath });
  await testInfo.attach('前年入力の外部統合後', { path: imagePath, contentType: 'image/png' });
  await app.getByRole('button',{name:'操作を取り消す',exact:true}).click();await expect(field(5)).toHaveValue('777');
  await app.getByRole('button',{name:'操作をやり直す',exact:true}).click();await expect(field(6)).toHaveValue('1002');
});
