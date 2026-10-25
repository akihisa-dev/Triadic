import { chromium } from '@playwright/test';
import { transform } from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {projectRoot as root} from './paths.mjs';
const {code}=await transform(await readFile(root+'/tests/ui/memory-files.ts','utf8'),{loader:'ts',format:'esm'});
const {installMemoryFiles}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const bytes=[...await readFile(root+'/samples/2027年度サンプル予算.triadic')];
const browser=await chromium.launch({channel:'chrome',headless:true});
const trials=[];
try {for(let i=0;i<5;i++) {
 const context=await browser.newContext({viewport:{width:1280,height:864},locale:'ja-JP'}),page=await context.newPage(),requests=[],errors=[];
 page.on('request',request=>{if(request.resourceType()==='script')requests.push(request.url());});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const start=performance.now();await page.goto('http://127.0.0.1:4173/Triadichrome-extension/index.html');await page.getByRole('button',{name:'ファイルを開く',exact:true}).waitFor();const entry=performance.now()-start;
 await page.evaluate(installMemoryFiles,{bytes,scenario:'normal'});
 const open=performance.now();await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await page.getByRole('heading',{name:'Home',exact:true}).waitFor();const home=performance.now()-open;
 const initialRequests=[...requests];
 const io=performance.now();await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'入出力',exact:true}).click();await page.getByRole('button',{name:'選んだ表を出力',exact:true}).waitFor();const firstIO=performance.now()-io;
 trials.push({entry,home,firstIO,initialRequests,ioRequests:requests.filter(r=>!initialRequests.includes(r)),errors});await context.close();
}}
finally {await browser.close();}
const result=JSON.stringify({node:process.version,trials},null,2);
if(process.argv[2])await writeFile(process.argv[2],result);
console.log(result);
