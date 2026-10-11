import { test,expect } from '@playwright/test';
test('本番設定の入口とファイル読込を段階別に比較する',async({browser})=>{
 const root=process.env.OPEN_MEASURE_DIR;test.skip(!root,'任意の測定');test.setTimeout(180_000);
 const hashes=new Map<string,string>();
 for(const fixture of ['small','initiatives','previous','history'])for(const version of ['before','after']){
  const context=await browser.newContext({viewport:{width:1280,height:864}}),page=await context.newPage();
  let phases:{phase:string;ms:number;context:string}[]=[],starts:string[]=[],published=0;
  page.on('pageerror',e=>console.log('MEASURE_ERROR '+e.message));page.on('console',m=>{const s=m.text();if(m.type()==='error')console.log('MEASURE_CONSOLE '+s);if(s.startsWith('OPEN_PHASE '))phases.push(JSON.parse(s.slice(11)));if(s.startsWith('SQLITE_START '))starts.push(s.slice(13));if(s==='SESSION_PUBLISHED')published++;});
  const trials=[];
  await page.addInitScript(()=>{
    const tasks:{task:string;ms:number}[]=[],files:number[]=[],access:number[]=[];const entry={visible:0,interactive:0};Object.assign(window,{measureTasks:tasks,measureFiles:files,measureAccess:access,measureEntry:entry});
    new MutationObserver(()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("ファイルを開く"));if(button&&!entry.visible)entry.visible=performance.now();if(button&&!button.disabled&&!entry.interactive)entry.interactive=performance.now();}).observe(document,{subtree:true,childList:true,attributes:true});
    const nativeGet=FileSystemFileHandle.prototype.getFile;FileSystemFileHandle.prototype.getFile=async function(){const start=performance.now();try{return await nativeGet.call(this);}finally{access.push(performance.now()-start);}};
    const nativeArray=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){const start=performance.now();try{return await nativeArray.call(this);}finally{files.push(performance.now()-start);}};
    const Native=Worker;window.Worker=class extends Native{
     begin=new Map<number,{task:string;start:number}>();
     constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{const p=this.begin.get(event.data.id);if(p){tasks.push({task:p.task,ms:performance.now()-p.start});this.begin.delete(event.data.id);}});}
     override postMessage(message:{id:number;task:string}){this.begin.set(message.id,{task:message.task,start:performance.now()});super.postMessage(message);}
    };
   });
  for(let trial=0;trial<6;trial++){
   phases=[];starts=[];published=0;
   await page.goto(`${root}/${version}/index.html`);
   await expect(page.getByRole('button',{name:'ファイルを開く',exact:true})).toBeEnabled({timeout:10000});
   const entry=await page.evaluate(()=>Reflect.get(window,"measureEntry"));
   expect(starts.filter(c=>c==="worker")).toHaveLength(0);
   expect(starts.filter(c=>c==="window")).toHaveLength(version==="after"?Number(process.env.OPEN_EXPECT_WINDOW ?? 0):1);
   await page.evaluate(async url=>{
    const bytes=await(await fetch(url)).arrayBuffer();const handle=await(await navigator.storage.getDirectory()).getFileHandle('測定.triadic',{create:true});const writer=await handle.createWritable();await writer.write(bytes);await writer.close();
    Object.defineProperty(window,'showOpenFilePicker',{value:async()=>[handle],configurable:true});
   },`${root}/${fixture}.triadic`);
   const start=await page.evaluate(()=>performance.now());
   await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
   await expect(page.locator('.home-file-name')).toHaveText('測定.triadic');
   const result=await page.evaluate(async start=>{const encoded=new TextEncoder().encode(JSON.stringify(Reflect.get(window,'publishedPlan')));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoded)),n=>n.toString(16).padStart(2,'0')).join('');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {hash,displayMs:performance.now()-start,tasks:Reflect.get(window,'measureTasks'),fileMs:Reflect.get(window,'measureFiles'),getFileMs:Reflect.get(window,'measureAccess')};},start);
   if(hashes.has(fixture))expect(result.hash).toBe(hashes.get(fixture));else hashes.set(fixture,result.hash);
   expect(published).toBe(1);expect(starts.filter(c=>c==='worker')).toHaveLength(1);
   trials.push({cold:trial===0,entry,...result,phases:[...phases],initializations:[...starts]});
  }
  console.log('FILE_OPEN '+JSON.stringify({fixture,version,browser:browser.version(),trials}));await context.close();
 }
});
