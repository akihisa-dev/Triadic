import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
test('Excelの依存は初期画面・入出力画面に含めず、専用Workerへ分離する',async()=>{
  const {metafile}=await build({entryPoints:['Triadichrome-extension/src/extension/main.tsx'],outdir:'dist/.lazy-graph',bundle:true,splitting:true,format:'esm',write:false,metafile:true,loader:{'.css':'empty','.png':'empty'},external:['*.wasm?url'],logLevel:'silent'});
  const outputs=metafile.outputs;
  const initial=Object.keys(outputs).find(file=>outputs[file].entryPoint?.endsWith('/main.tsx'));
  const deferred=Object.keys(outputs).find(file=>outputs[file].entryPoint?.endsWith('/SpreadsheetIOPage.tsx'));
  assert.ok(initial);assert.ok(deferred);
  const graph=start=>{const seen=new Set();const visit=file=>{if(seen.has(file))return;seen.add(file);for(const item of outputs[file]?.imports??[])if(!item.external&&item.kind!=='dynamic-import')visit(item.path);};visit(start);return [...seen].flatMap(file=>Object.keys(outputs[file]?.inputs??{}));};
  const worker = await build({entryPoints:['Triadichrome-extension/src/extension/workbookExport.worker.ts'],outfile:'dist/.lazy-graph/export-worker.js',bundle:true,format:'esm',write:false,metafile:true,logLevel:'silent'});
  const workerInputs = Object.keys(worker.metafile.inputs);
  for(const dependency of ['exceljs','jszip','saxes']){
    assert.equal(graph(initial).some(file=>file.includes(`node_modules/${dependency}/`)),false,`${dependency}を起動時に読み込まない`);
    assert.equal(graph(deferred).some(file=>file.includes(`node_modules/${dependency}/`)),false,`${dependency}を画面の処理へ読み込まない`);
    assert.ok(workerInputs.some(file=>file.includes(`node_modules/${dependency}/`)),`${dependency}は出力Worker内で使う`);
  }
  const html=await readFile('dist/extension/index.html','utf8');
  assert.equal(/modulepreload[^>]*SpreadsheetIOPage/.test(html),false);
});
