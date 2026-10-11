// Diagnostic instrumentation is confined to a private temporary bundle; product checks stay unchanged.
import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import os from 'node:os';
import {projectRoot as root} from './paths.mjs';
const temporary=await mkdtemp(join(root,'dist','.save-measure-'));
let metrics;
const record=(name,start)=>{if(metrics){const entry=metrics[name]??={count:0,ms:0};entry.count++;entry.ms+=performance.now()-start;}};
globalThis.__triadicMeasure=record;
try {
const entry=join(temporary,'source.ts');await writeFile(entry,`export * from ${JSON.stringify(join(root,'tests/core-api.ts'))}; export {initializeSqlite} from ${JSON.stringify(join(root,'Triadichrome-extension/src/core/storage/sqliteRuntime.ts'))};`);
const outfile=join(temporary,'entry.mjs');
await build({entryPoints:[entry],outfile,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[
{name:'measure-assert',setup(api){api.onLoad({filter:/triadicDatabase\.ts$/},async args=>{
const source=await readFile(args.path,'utf8');const signature='function assertDatabase(db: Database, documentType: DocumentType): void {';
if(!source.includes(signature))throw Error('検査関数の測定入口が変わっています。');
return {loader:'ts',contents:source.replace(signature,'function checkedDatabase(db: Database, documentType: DocumentType): void {')+`\nfunction assertDatabase(db: Database, documentType: DocumentType): void {const start=performance.now();try{checkedDatabase(db,documentType);}finally{globalThis.__triadicMeasure('assert:'+documentType,start);}}`};});}},
{name:'local-wasm',setup(api){api.onResolve({filter:/\.wasm\?url$/},()=>({path:'wasm',namespace:'wasm'}));api.onLoad({filter:/.*/,namespace:'wasm'},()=>({loader:'js',contents:`export default ${JSON.stringify(join(root,'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'))};`}));}}
]});
const api=await import(pathToFileURL(outfile)),sql=await api.initializeSqlite();
for(const name of ['exec','export']) {const original=sql.Database.prototype[name];sql.Database.prototype[name]=function(...args){const label=name==='export'?'sqlite-export':args[0]==='PRAGMA integrity_check'?'integrity-check':args[0]==='PRAGMA foreign_key_check'?'foreign-key-check':null;const start=performance.now();try{return original.apply(this,args);}finally{if(label)record(label,start);}};}
const results=[];
for(const [size,count,histories] of [['small',10,0],['medium',100,3],['large',500,10]]) {
let bytes=await api.createTriadicDatabase(2026);const db=await api.openTriadicDatabase(bytes);
try {const account=Number(db.exec('SELECT id FROM accounts LIMIT 1')[0].values[0][0]);db.run('BEGIN');for(let i=0;i<count;i++){
db.run('INSERT INTO initiatives (name,expansion_id,industry_id,department_id,sort_order) VALUES (?,1,1,1,?)',[`合成${i}`,i]);const owner=Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);db.run('INSERT INTO initiative_rows (id,initiative_id,account_id,sort_order) VALUES (?,?,?,0)',[`row-${i}`,owner,account]);for(let month=1;month<=12;month++)db.run('INSERT INTO initiative_amounts (row_id,kind_id,month,amount_yen) VALUES (?,1,?,?)',[`row-${i}`,month,1001]);}db.run('COMMIT');bytes=api.exportTriadicDatabase(db);}finally{db.close();}
for(let i=0;i<histories;i++){bytes=await api.trackHistoryChange(bytes,await api.saveKindSelection(bytes,'cost-table',[i%2+1]));bytes=await api.recordDataHistory(bytes,new Date().toISOString(),true);}
const contents=await api.readPlanContents(bytes),commands=[{type:'initiative.update',id:contents.initiatives[0].id,draft:{...contents.initiatives[0],fiscalYear:'2026',note:'測定変更'}},{type:'settings',change:{type:'previous',input:{industryId:1,departmentId:1,rows:[{accountId:contents.accounts[0].id,amounts:{4:'2.001'}}]}}},{type:'account',change:{type:'update',...contents.accounts[0],accountName:'測定科目'}}];
const historyStatus=await api.readDataHistory(bytes),file=join(temporary,'合成.triadic');
for(const command of commands) {const trials=[];for(let trial=0;trial<6;trial++) {
await writeFile(file,bytes);const handle={name:'合成.triadic',async getFile(){const start=performance.now();try{return new File([await readFile(file)],this.name);}finally{record('file-read',start);}},async createWritable(){let pending;return {async write(value){const start=performance.now();try{pending=new Uint8Array(value);await writeFile(file+'.pending',pending);}finally{record('file-write',start);}},async close(){const start=performance.now();try{await rename(file+'.pending',file);}finally{record('file-commit',start);}},async abort(){await rm(file+'.pending',{force:true});}};}};
const session=new api.PlanSession();await session.open({...contents,bytes,handle,name:handle.name});metrics={};const start=performance.now();await session.dispatch(command,async()=>handle);const elapsed=performance.now()-start;const captured=metrics;metrics=undefined;if(trial>0)trials.push({elapsed,...captured});}
results.push({size,initiatives:count,amounts:count*12,histories:historyStatus.entries.length,bytes:bytes.length,operation:command.type,trials});}
}
console.log(JSON.stringify({environment:{node:process.version,os:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,sqlite:sql.version},note:'合成データ・専用一時ファイル。各条件はウォームアップ1回後に5回測定。検査時間はintegrity/FKを含むため加算しない。ファイル書込はNodeの一時ファイルへのwrite/renameでありChromeの実ファイル境界とは異なる。',results},null,2));
} finally{delete globalThis.__triadicMeasure;await rm(temporary,{recursive:true,force:true});}
