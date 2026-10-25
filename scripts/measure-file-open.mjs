import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp,readFile,writeFile,rm,mkdir } from 'node:fs/promises';
import { join,relative } from 'node:path';
import { execFileSync,spawn } from 'node:child_process';
import { withNodeBundle } from './node-bundle.mjs';
import { projectRoot } from './paths.mjs';
const dir=await mkdtemp(join(projectRoot,'dist','.open-measure-'));
const baseline=process.env.OPEN_BASELINE || 'b10f99b';
const observe=`function observed<T>(phase:string,operation:()=>T):T{const start=performance.now();try{return operation();}finally{console.info('OPEN_PHASE '+JSON.stringify({phase,ms:performance.now()-start,context:typeof window==='undefined'?'worker':'window'}));}}`;
function plugin(before){return {name:'open-observation',enforce:'pre',async transform(source,id){
 if(!id.includes('/Triadic-extension/src/')||!id.endsWith('.ts')&&!id.endsWith('.tsx'))return;
 const revision=before?baseline:process.env.OPEN_TARGET;
 if(revision){try{source=execFileSync('git',['show',`${revision}:${relative(projectRoot,id)}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}}
 if(id.endsWith('/sqliteRuntime.ts')){
  source=source.trimEnd();
  source=source.replace('constructor(data?: ArrayLike<number>) {','constructor(data?: ArrayLike<number>) { const started=performance.now();');
  source=source.replace('      }\n      exec(sql:',"        if(data)console.info('OPEN_PHASE '+JSON.stringify({phase:'import',ms:performance.now()-started,context:typeof window==='undefined'?'worker':'window'}));\n      }\n      exec(sql:");
  source=source.replace('return runtime ??= initialize','const first=!runtime; const started=performance.now(); if(first)console.info("SQLITE_START "+(typeof window===\'undefined\'?\'worker\':\'window\')); const result=runtime ??= initialize');
  source=source.replace(/  \}\);\n\}\s*$/,'  });\nif(first)void result.then(()=>console.info("OPEN_PHASE "+JSON.stringify({phase:"initialize",ms:performance.now()-started,context:typeof window==="undefined"?"worker":"window"})));return result;\n}');
 }
 const wraps=[['/triadicDatabase.ts','function assertDatabase(','assertDatabase','check'],['/readPlan.ts','export function readContents(','readContents','projection'],['/dataHistory.ts','export function historyFromDatabase(','historyFromDatabase','history']];
 for(const [file,pattern,name,phase]of wraps)if(id.endsWith(file)){source=source.replace(pattern,pattern.replace(name,'measured'+name));source+='\n'+observe+`\n${pattern.startsWith('export')?'export ':''}function ${name}(...args:Parameters<typeof measured${name}>){return observed('${phase}',()=>measured${name}(...args));}`;}
 if(id.endsWith('/PlanSession.ts'))source=source.replace('private publish(patch: Partial<SessionSnapshot>) {','private publish(patch: Partial<SessionSnapshot>) { const started=performance.now();').replace('this.listeners.forEach(listener => listener());',`this.listeners.forEach(listener => listener());if(patch.contents){Object.assign(globalThis,{publishedPlan:{contents:patch.contents,history:patch.history}});console.info('OPEN_PHASE '+JSON.stringify({phase:'publication',ms:performance.now()-started,context:'window'}));console.info('SESSION_PUBLISHED');}`);
 return {code:source,map:null};
}};}
try{
 await withNodeBundle('tests/core-api.ts',async api=>{
  const seed=await api.openTriadicDatabase(await api.createSamplePlan(2026,true));
  let base,initiatives;
  try{seed.exec('DELETE FROM previous_amounts;DELETE FROM data_history;UPDATE data_history_state SET next_id=1,dirty_since=NULL WHERE id=1');initiatives=seed.export();seed.exec('DELETE FROM initiative_rows;DELETE FROM initiatives');base=seed.export();}finally{seed.close();}
  const variants={small:base,initiatives};
  const db=await api.openTriadicDatabase(base);
  try{
   const contents=await api.readPlanContents(base);
   for(const account of contents.accounts)for(const industry of contents.industries)for(const department of contents.departments)if(department.industryIds.includes(industry.id))for(let month=1;month<=12;month++)db.run('INSERT INTO previous_amounts(account_id,industry_id,department_id,month,amount_yen)VALUES(?,?,?,?,?)',[account.id,industry.id,department.id,month,1]);
   variants.previous=db.export();
  }finally{db.close();}
  const snapshot=await api.createBusinessSnapshot(base),history=await api.openTriadicDatabase(base);
  try{for(let id=1;id<=50;id++)history.run('INSERT INTO data_history(id,recorded_at,snapshot)VALUES(?,?,?)',[id,new Date(Date.UTC(2026,0,1,0,id)).toISOString(),snapshot]);history.run('UPDATE data_history_state SET next_id=51 WHERE id=1');variants.history=history.export();}finally{history.close();}
  for(const[name,bytes]of Object.entries(variants)){const {contents,savedHistory}=await api.processingTasks.readSavedPlan(bytes);console.log('FILE_FIXTURE '+JSON.stringify({name,bytes:bytes.length,initiatives:contents.initiatives.length,previous:contents.previousAmounts.length,history:savedHistory.entries.length}));await writeFile(join(dir,name+'.triadic'),bytes);}
 });
 for(const version of ['before','after']){
  const out=join(dir,version);await mkdir(out);
  await build({configFile:false,root:projectRoot,base:'./',plugins:[plugin(version==='before'),react()],worker:{format:'es',plugins:()=>[plugin(version==='before')]},build:{outDir:out,emptyOutDir:true,rollupOptions:{input:join(projectRoot,'index.html')}}});
 }
 const config=join(dir,"playwright.config.ts");await writeFile(config,`import original from ${JSON.stringify(join(projectRoot,"playwright.config.ts"))};export default {...original,reporter:[["list"]],outputDir:${JSON.stringify(join(dir,"test-results"))},testDir:${JSON.stringify(join(projectRoot,"tests/ui"))},use:{...original.use,baseURL:"http://127.0.0.1:4175"},webServer:{...original.webServer,command:"npm run dev:ui -- --port 4175",url:"http://127.0.0.1:4175/tests/ui/preview.html"}};`);
 const code=await new Promise((resolve,reject)=>{const child=spawn('npx',['playwright','test','file-open-measure.spec.ts','--project','desktop','--workers','1','--config',config],{cwd:projectRoot,stdio:'inherit',env:{...process.env,OPEN_MEASURE_DIR:'/'+relative(projectRoot,dir)}});child.on('exit',resolve);child.on('error',reject);});
 if(code!==0)throw Error('ファイル読込の比較に失敗しました。');
}finally{await rm(dir,{recursive:true,force:true});}
