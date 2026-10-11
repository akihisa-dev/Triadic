import { build } from "esbuild";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, relative } from "node:path";
import { projectRoot } from "./paths.mjs";
const dir = await mkdtemp(join(projectRoot,"dist",".cost-measure-"));
try {
 for (const version of ["before","after"]) {
  await build({ entryPoints:[join(projectRoot,"tests/ui/cost-performance.tsx")], outfile:join(dir,version+".js"),bundle:true,format:"esm",platform:"browser",target:"esnext",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"diagnostic",setup(api){
   api.onLoad({filter:/\/costTable\.ts$/},async args=>{
    let source=version==="before"?execFileSync("git",["show",`e0d3d97:${relative(projectRoot,args.path)}`],{encoding:"utf8"}):await readFile(args.path,"utf8");
    source=source.replace("export function buildCostTable(","function measuredCostTable(");
    source+='\nconst costObservation={calls:[] as number[]};Object.assign(window,{costObservation});export function buildCostTable(...args:Parameters<typeof measuredCostTable>){const start=performance.now();try{return measuredCostTable(...args);}finally{costObservation.calls.push(performance.now()-start);}}';
    return {loader:"ts",contents:source};
   });
   api.onResolve({filter:/\.wasm\?url$/},()=>({path:"wasm",namespace:"diagnostic"}));
   api.onLoad({filter:/.*/,namespace:"diagnostic"},()=>({loader:"js",contents:'export default "/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm";'}));
  }}]});
  await writeFile(join(dir,version+".html"),`<!doctype html><html lang="ja"><head><meta charset="UTF-8"><link rel="stylesheet" href="./${version}.css"></head><body><div id="root"></div><script type="module" src="./${version}.js"></script></body></html>`);
 }
 const code=await new Promise((resolve,reject)=>{const child=spawn("npx",["playwright","test","cost-monthly-measure.spec.ts","--project","desktop","--workers","1"],{cwd:projectRoot,stdio:"inherit",env:{...process.env,COST_MEASURE_DIR:"/"+relative(projectRoot,dir)}});child.on("exit",resolve);child.on("error",reject);});
 if(code!==0)throw Error("総原価表の比較に失敗しました。");
}finally{await rm(dir,{recursive:true,force:true});}
