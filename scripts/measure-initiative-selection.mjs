// Temporary browser bundles only; no diagnostic instrumentation enters the product.
import { build } from "esbuild";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, relative } from "node:path";
import { projectRoot } from "./paths.mjs";
const temporary = await mkdtemp(join(projectRoot, "dist", ".selection-measure-"));
try {
  for (const environment of ["development", "production"]) for (const version of ["before", "after"]) {
    const name = `${environment}-${version}`;
    await build({ entryPoints: [join(projectRoot, "tests/ui/performance-preview.tsx")], outfile: join(temporary, name+".js"),
      bundle: true, platform: "browser", format: "esm", target: "esnext", define: { "process.env.NODE_ENV": JSON.stringify(environment) },
      plugins: [{ name: "diagnostic-code", setup(api) {
        api.onLoad({ filter: /InitiativeAmountGrid\.tsx$/ }, async args => {
          let source = version === "before"
            ? execFileSync("git", ["show", `2e06a6f:${relative(projectRoot, args.path)}`], { encoding: "utf8" }) : await readFile(args.path,"utf8");
          source = 'import { useLayoutEffect as observeCommit } from "react";\n'+source;
          source = source.replace('  const readOnly = useHistoryReadOnly();', '  gridRenderMetrics.renders++; observeCommit(() => { gridRenderMetrics.commits++; });\n  const readOnly = useHistoryReadOnly();');
          source += '\nconst gridRenderMetrics = { renders: 0, commits: 0 }; Object.assign(window, { gridRenderMetrics });';
          return { loader: "tsx", contents: source };
        });
        api.onLoad({ filter: /initiativeGrid\.ts$/ }, async args => {
          let source = await readFile(args.path,"utf8");
          source = source.replace("export function initiativeAmountTotals(", "function measuredInitiativeAmountTotals(");
          source += `\nconst aggregateMetrics: {ms:number}[] = []; Object.assign(window,{aggregateMetrics});
export function initiativeAmountTotals(...args: Parameters<typeof measuredInitiativeAmountTotals>) { const start=performance.now();try{return measuredInitiativeAmountTotals(...args);}finally{aggregateMetrics.push({ms:performance.now()-start});} }`;
          return { loader: "ts", contents: source };
        });
        api.onResolve({ filter: /\.wasm\?url$/ }, () => ({ path: "wasm", namespace: "diagnostic-wasm" }));
        api.onLoad({ filter: /.*/, namespace: "diagnostic-wasm" }, () => ({ loader: "js", contents: 'export default "/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm";' }));
      } }],
    });
    await writeFile(join(temporary, name+".html"), `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><link rel="stylesheet" href="./${name}.css"><title>選択時の計算比較</title></head><body><div id="root"></div><script type="module" src="./${name}.js"></script></body></html>`);
  }
  const code = await new Promise(resolve => {
    const child = spawn("npx", ["playwright", "test", "initiative-selection-measure.spec.ts", "--project", "desktop", "--workers", "1"], {
      cwd: projectRoot, stdio: "inherit", env: { ...process.env, GRID_MEASURE_DIR: "/"+relative(projectRoot,temporary) },
    });
    child.on("exit", resolve); child.on("error", error => { throw error; });
  });
  if (code !== 0) throw new Error("選択操作の性能測定に失敗しました。");
} finally { await rm(temporary, { recursive: true, force: true }); }
