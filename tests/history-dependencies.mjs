import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { join,dirname,normalize } from 'node:path';
import { projectRoot } from '../scripts/paths.mjs';
export async function verifyHistoryDependencies(api) {
 assert.equal(api.HISTORY_INTERVAL_MS,5*60*1000);
 assert.deepEqual(api.emptyDataHistory,{entries:[],dirtySince:null});
 const result=await build({entryPoints:{main:join(projectRoot,'Triadic-extension/src/extension/main.tsx'),worker:join(projectRoot,'Triadic-extension/src/extension/planProcessing.worker.ts')},
  outdir:join(projectRoot,'dist','.history-dependencies'),bundle:true,splitting:true,format:'esm',platform:'browser',write:false,metafile:true,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'asset-references',setup(builder){builder.onResolve({filter:/\?(url|no-inline)$/},args=>({path:args.path,namespace:'asset-reference'}));builder.onLoad({filter:/.*/,namespace:'asset-reference'},()=>({contents:'export default "asset"',loader:'js'}));}}]});
 const outputs=result.metafile.outputs;
 function staticInputs(entry){
  const start=Object.keys(outputs).find(path=>outputs[path].entryPoint?.endsWith(entry));assert.ok(start);
  const visited=new Set(),inputs=new Set();
  function visit(path){if(visited.has(path))return;visited.add(path);const output=outputs[path];assert.ok(output,`出力参照: ${path}`);
   for(const input of Object.keys(output.inputs))inputs.add(input);
   for(const imported of output.imports)if(imported.kind==='import-statement'&&!imported.external)visit(outputs[imported.path]?imported.path:normalize(join(dirname(path),imported.path)));
  }visit(start);return [...inputs];
 }
 const main=staticInputs('/main.tsx'),worker=staticInputs('/planProcessing.worker.ts');
 assert.ok(main.some(path=>path.endsWith('/core/domain/dataHistory.ts')),'画面は共通の軽量な状態定義を使う');
 for(const file of ['sqliteRuntime.ts','triadicDatabase.ts','storage/dataHistory.ts'])assert.ok(!main.some(path=>path.endsWith('/'+file)),`初期画面は ${file} を実行時に読み込まない`);
 assert.ok(worker.some(path=>path.endsWith('/core/storage/sqliteRuntime.ts')),'Workerは必要な実SQLite実装を使う');
 assert.ok(worker.some(path=>path.endsWith('/core/domain/dataHistory.ts')),'Workerも同じ間隔を共有する');
 console.log('PASS: 初期画面の静的依存はSQLiteを含まず、Workerは実SQLiteと共通履歴定義を使用');
}
