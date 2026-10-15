import { test, expect } from './fixtures';

for (const year of [2026, 2027]) for (const duringSave of [false, true]) test(`${year}年度の施策の外部月額を保持し、保存${duringSave ? '中' : '後'}の追加編集を失わない`, async ({page,app},testInfo) => {
  await page.clock.install({ time: new Date(`${year}-10-12T12:00:00+09:00`) });
  await page.goto('/tests/ui/preview.html');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate((_element, hold: boolean) => {
    const target=window as Window & typeof globalThis & {showOpenFilePicker:()=>Promise<FileSystemFileHandle[]>;rebaseTest?:{started:boolean;release:()=>void}};
    const picker=target.showOpenFilePicker.bind(target);
    Object.defineProperty(target,'showOpenFilePicker',{value:async()=>{
      const [handle]=await picker();
      const get=handle!.getFile.bind(handle),create=handle!.createWritable.bind(handle);
      const path='/Triadichrome-extension/src/core/storage/';
      const {readPlanContents}=await import(path+'readPlan.ts');
      const {updateInitiative}=await import(path+'initiatives.ts');
      const base=new Uint8Array(await (await get()).arrayBuffer());
      const contents=await readPlanContents(base);
      const original=contents.initiatives.find((item:{name:string})=>item.name==='既存商品の販売拡大');
      const bytes=await updateInitiative(base,original.id,contents.fiscalYear,{...original,fiscalYear:String(contents.fiscalYear),rows:original.rows.map((row:{amounts:Record<number,string>},index:number)=>index===0?{...row,amounts:{...row.amounts,5:'777'}}:row)});
      let reads=0,committed=false;
      Object.defineProperty(handle,'getFile',{value:async()=>++reads>1&&!committed?new File([bytes],handle!.name):get()});
      Object.defineProperty(handle,'createWritable',{value:async()=>{
        const writer=await create(),close=writer.close.bind(writer);
        Object.defineProperty(writer,'close',{value:async()=>{
          if(hold&&!committed){await new Promise<void>(resolve=>{target.rebaseTest={started:true,release:resolve};});}
          await close();committed=true;
        }});return writer;
      }});
      return [handle!];
    }});
  },duringSave);
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
  await app.getByRole('button',{name:'既存商品の販売拡大',exact:true}).click();
  const april=app.getByRole('spinbutton',{name:'売上高 4月の金額',exact:true}).first();
  const may=app.getByRole('spinbutton',{name:'売上高 5月の金額',exact:true}).first();
  const june=app.getByRole('spinbutton',{name:'売上高 6月の金額',exact:true}).first();
  await april.fill('121');
  if(duringSave){
    await expect.poll(()=>app.locator('body').evaluate(()=>Boolean((window as Window & {rebaseTest?:{started:boolean}}).rebaseTest?.started))).toBe(true);
    await june.fill('131');
    await app.locator('body').evaluate(()=>{(window as Window & {rebaseTest?:{release:()=>void}}).rebaseTest!.release();});
  }
  await expect(may).toHaveValue('777');
  if(!duringSave)await june.fill('131');
  const back=app.getByRole('button',{name:'← 施策一覧へ戻る',exact:true});
  await expect(back).toBeEnabled();
  await back.click();await app.getByRole('button',{name:'既存商品の販売拡大',exact:true}).click();
  await expect(april).toHaveValue('121');await expect(may).toHaveValue('777');await expect(june).toHaveValue('131');
  await page.screenshot({path:`/tmp/triadichrome-rebased-draft-${year}-${testInfo.project.name}-${duringSave}.png`});
  await app.getByRole('button',{name:'操作を取り消す',exact:true}).click();
  // May already has the external value before undo; wait for the operation itself.
  await expect(app.getByText('操作を取り消しました。',{exact:true})).toBeVisible();
  await expect(may).toHaveValue('777');
  await app.getByRole('button',{name:'操作をやり直す',exact:true}).click();
  await expect(app.getByText('操作をやり直しました。',{exact:true})).toBeVisible();
  await expect(june).toHaveValue('131');
});
