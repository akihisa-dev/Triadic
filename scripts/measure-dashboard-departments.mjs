import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { projectRoot } from './paths.mjs';

if (process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV=productionで実行してください。');
const pageSource = process.argv[2];
await mkdir(path.join(projectRoot, 'dist'), { recursive: true });
const temporary = await mkdtemp(path.join(projectRoot, 'dist/.measure-dashboard-'));
try {
  const entry = path.join(temporary, 'entry.ts'), outfile = path.join(temporary, 'bundle.mjs');
  await writeFile(entry, `import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DashboardPage} from ${JSON.stringify(path.join(projectRoot, 'Triadic-extension/src/extension/DashboardPage.tsx'))};
export function render(count) {
  const contents={fiscalYear:2026,accounts:[{id:1,accountCode:'100',accountName:'売上',accountType:'sales',inUse:false}],
    aggregations:[],expansions:[],expansionCategories:[],periodTypes:[],previousAmounts:[],initiatives:[],
    industries:[{id:1,industryName:'業種',industryCode:'1',identity:'industry'}],
    departments:Array.from({length:count},(_,id)=>({id:id+1,departmentName:'部署'+id,identity:'department'+id,industryIds:[1]}))};
  return renderToStaticMarkup(createElement(DashboardPage,{contents,selected:[1,2],previous:{1:1,2:1},disabled:false,onSelection(){},onDepartment(){},onInitiative(){}}));
}`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
    plugins: [{ name: 'count-dashboard-amounts', setup(api) {
      api.onLoad({ filter: /DashboardPage\.tsx$/ }, async args => ({ contents: await readFile(pageSource ?? args.path, 'utf8'), loader: 'tsx', resolveDir: path.dirname(args.path) }));
      api.onLoad({ filter: /tables[/\\]dashboard\.ts$/ }, async args => {
        const source = await readFile(args.path, 'utf8'), start = source.indexOf('export function dashboardAmounts('), opening = source.indexOf('{', start);
        if (start < 0 || opening < 0) throw new Error('集計回数の計測箇所を特定できません。');
        return { contents: source.slice(0, opening + 1) + 'globalThis.__triadicDashboardCalls = (globalThis.__triadicDashboardCalls ?? 0) + 1;' + source.slice(opening + 1), loader: 'ts', resolveDir: path.dirname(args.path) };
      });
    } }],
  });
  const { render } = await import(pathToFileURL(outfile));
  const results = [];
  for (const departments of [10, 50, 100, 200]) {
    for (let warmup = 0; warmup < 2; warmup++) render(departments);
    const trials = [];
    for (let trial = 0; trial < 3; trial++) {
      globalThis.__triadicDashboardCalls = 0;
      const start = performance.now(), html = render(departments), ms = performance.now() - start;
      trials.push({ calls: globalThis.__triadicDashboardCalls, ms, htmlHash: createHash('sha256').update(html).digest('hex') });
    }
    results.push({ departments, trials });
  }
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, warmups: 2, results }, null, 2));
} finally {
  delete globalThis.__triadicDashboardCalls;
  await rm(temporary, { recursive: true, force: true });
}
