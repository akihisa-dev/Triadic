import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { withNodeBundle } from "../scripts/node-bundle.mjs";
import { oldPlan, oldSnapshot } from "./fixtures/sqlite-349-normal.mjs";
import { build } from "esbuild";

test("計画処理workerは画面と実ファイル保存へ依存しない", async () => {
  const result = await build({
    entryPoints: ["Triadichrome-extension/src/extension/planProcessing.worker.ts"],
    bundle: true, write: false, metafile: true, format: "esm", platform: "browser",
    packages: "external", external: ["*.wasm?url"],
  });
  const inputs = Object.keys(result.metafile.inputs);
  const adapters = inputs.filter(file => file.includes("/extension/"));
  assert.deepEqual(adapters.sort(), [
    "Triadichrome-extension/src/extension/planProcessing.worker.ts",
    "Triadichrome-extension/src/extension/planProcessingTasks.ts",
  ]);
  assert.ok(inputs.includes("Triadichrome-extension/src/core/storage/planCommands.ts"));
});

test("同梱本体の版・配布WASMと検索・複数文・保存メモリの境界を確認する", async () => {
  await withNodeBundle("Triadichrome-extension/src/core/storage/sqliteRuntime.ts", async ({ initializeSqlite }) => {
    const SQL = await initializeSqlite();
    assert.equal(SQL.version, "3.53.4");
    const db = new SQL.Database();
    try {
      assert.deepEqual(db.exec("SELECT sqlite_version() AS version")[0].values, [["3.53.4"]]);
      db.run("CREATE TABLE records (id INTEGER PRIMARY KEY, label TEXT, value INTEGER, payload BLOB)");
      db.run("INSERT INTO records VALUES (?, ?, ?, ?)", [1, "引用;符号", Number.MAX_SAFE_INTEGER, new Uint8Array([1, 2, 255])]);
      assert.equal(db.getRowsModified(), 1);
      assert.deepEqual(db.exec("SELECT * FROM records WHERE id = 99"), []);
      assert.deepEqual(db.exec("SELECT label FROM records; SELECT value FROM records"), [
        { columns: ["label"], values: [["引用;符号"]] }, { columns: ["value"], values: [[Number.MAX_SAFE_INTEGER]] },
      ]);
      assert.deepEqual(db.exec("SELECT ? AS bound; SELECT 42 AS next", ["文字;列"])[0].values, [["文字;列"]]);
      assert.throws(() => db.exec("SELECT 9223372036854775807"), /範囲/);
      assert.throws(() => db.exec("SELECT nonexistent FROM records"));
      assert.deepEqual(db.exec("SELECT payload FROM records")[0].values, [[new Uint8Array([1, 2, 255])]]);
      const original = db.export();
      db.attachReadonly("comparison", original);
      assert.deepEqual(db.exec("SELECT label, value FROM comparison.records")[0].values, [["引用;符号", Number.MAX_SAFE_INTEGER]]);
      assert.throws(() => db.run("DELETE FROM comparison.records"), /readonly|read.only|SQLITE_READONLY/i);
      assert.throws(() => db.attachReadonly('invalid"name', original), /正しくありません/);
      assert.deepEqual(db.export(), original, "参照専用の接続と拒否では保存内容を変えない");
      const bytes = db.export();
      const copy = new SQL.Database(bytes);
      try {
        for (let id = 2; id < 250; id++) copy.run("INSERT INTO records VALUES (?, ?, ?, NULL)", [id, "容量増加".repeat(100), -Number.MAX_SAFE_INTEGER]);
        assert.deepEqual(copy.exec("SELECT count(*) FROM records")[0].values, [[249]]);
        assert.deepEqual(db.exec("SELECT count(*) FROM records")[0].values, [[1]]);
        assert.deepEqual(bytes, db.export(), "保存データは別接続の成長でも変化しない");
      } finally { copy.close(); }
    } finally { db.close(); db.close(); }
  });
  const assets = await readdir("Triadichrome-extension/assets");
  const wasm = assets.filter(name => /^sqlite3-.*\.wasm$/.test(name));
  assert.equal(wasm.length, 1);
  const distribution = await sqlite3InitModule({ locateFile: () => path.resolve("Triadichrome-extension/assets/" + wasm[0]) });
  const distributionDb = new distribution.oo1.DB(":memory:", "c");
  try { assert.equal(distributionDb.selectValue("SELECT sqlite_version()"), "3.53.4"); }
  finally { distributionDb.close(); }
  assert.ok(!assets.some(name => /sql-wasm/.test(name)), "旧本体を配布しない");
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha(await readFile("Triadichrome-extension/assets/" + wasm[0])),
    sha(await readFile("node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm")));
  const notices = await readFile("Triadichrome-extension/assets/sqlite-wasm-LICENSE.txt", "utf8");
  assert.ok(notices.includes("LICENSE for the sqlite3"));
  assert.ok(notices.includes('SQLITE_VERSION "3.53.4"'));
  assert.ok(notices.includes("Apache License"));
});

test("旧保存形式の計画・履歴は読み込みと編集を拒否し元の内容を保持する", async () => {
  await withNodeBundle("tests/core-api.ts", async api => {
    const bytes = new Uint8Array(inflateSync(Buffer.from(oldPlan, "base64")));
    const before = bytes.slice();
    await assert.rejects(api.validateTriadicDatabase(bytes), /保存形式には対応/);
    let edited = false;
    await assert.rejects(api.editDatabase(bytes, () => { edited = true; }), /保存形式には対応/);
    assert.equal(edited, false, "旧形式に対して編集処理を実行しない");
    assert.deepEqual(bytes, before);
    const snapshot = new Uint8Array(inflateSync(Buffer.from(oldSnapshot, "base64")));
    const originalSnapshot = snapshot.slice();
    await assert.rejects(api.openBusinessSnapshot(snapshot), /保存形式には対応/);
    assert.deepEqual(snapshot, originalSnapshot);
  });
});

async function withInitializationFault({ failures = 0, schema = false }, operation) {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const temporary = await mkdtemp(path.resolve('dist/.initialization-retry-'));
  try {
    const bundle = path.join(temporary,'entry.mjs');
    await build({stdin:{contents:`export * from './tests/core-api.ts'; export { initializationAttempts } from './Triadichrome-extension/src/core/storage/sqliteRuntime.ts';`,resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{
      name:'initialization-fault',setup(api) {
        api.onResolve({filter:/\.wasm\?url$/},()=>({path:'wasm',namespace:'fault-wasm'}));
        api.onLoad({filter:/.*/,namespace:'fault-wasm'},()=>({contents:`export default ${JSON.stringify(path.resolve('node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'))}`,loader:'js'}));
        api.onLoad({filter:/\/sqliteRuntime\.ts$/},async({path:file})=>{
          let contents=await readFile(file,'utf8');
          contents=contents.replace('initialize({ locateFile: () => wasmUrl })','faultedInitialize({ locateFile: () => wasmUrl })');
          contents+=`\nlet attempts=0; export function initializationAttempts(){return attempts;} async function faultedInitialize(options: {locateFile:(name:string)=>string}) { if (++attempts <= ${failures}) throw new Error('一時的な初期化失敗'); return initialize(options); }`;
          return {contents,loader:'ts'};
        });
        if(schema) api.onLoad({filter:/\/triadicDatabase\.ts$/},async({path:file})=>{
          let contents=await readFile(file,'utf8');
          contents=contents.replace('canonical.exec(TRIADIC_SCHEMA_SQL);',`if(type === 'snapshot' && !faultedSchema) {faultedSchema=true;throw new Error('一時的なスキーマ準備失敗');} canonical.exec(TRIADIC_SCHEMA_SQL);`);
          contents+='\nlet faultedSchema=false;';return {contents,loader:'ts'};
        });
      }
    }]});
    await operation(await import(pathToFileURL(bundle)));
  } finally {await rm(temporary,{recursive:true,force:true});}
}

test('SQLite初期化の失敗は同時要求へ返し、次の明示要求で再準備する',async()=>{
  await withInitializationFault({failures:1},async api=>{
    const requests=await Promise.allSettled([api.createTriadicDatabase(2026),api.createTriadicDatabase(2026),api.openTriadicDatabase(new Uint8Array())]);
    assert.ok(requests.every(result=>result.status==='rejected' && /一時的な初期化失敗/.test(result.reason.message)));
    assert.equal(api.initializationAttempts(),1,'同時要求は初期化を共有');
    assert.deepEqual(api.businessSchemaDefinitions(),[],'失敗状態を公開しない');
    const bytes=await api.createTriadicDatabase(2026),before=bytes.slice();
    await api.validateTriadicDatabase(bytes);
    assert.equal(api.initializationAttempts(),2,'次の要求で一度だけ再初期化');
    await assert.rejects(api.openTriadicDatabase(new Uint8Array([1,2,3])));
    await api.validateTriadicDatabase(bytes);
    assert.equal(api.initializationAttempts(),2,'不正ファイル拒否で成功済み本体は破棄しない');
    assert.deepEqual(bytes,before);
  });
  await withInitializationFault({failures:100},async api=>{
    await assert.rejects(api.createTriadicDatabase(2026),/初期化失敗/);
    await assert.rejects(api.createTriadicDatabase(2026),/初期化失敗/);
    assert.equal(api.initializationAttempts(),2,'自動の無制限再試行はしない');
  });
});

test('正規スキーマは両形式の準備完了後に公開し、失敗後に再準備する',async()=>{
  await withInitializationFault({schema:true},async api=>{
    await assert.rejects(api.createTriadicDatabase(2026),/スキーマ準備失敗/);
    assert.deepEqual(api.businessSchemaDefinitions(),[],'部分的な定義を公開しない');
    const bytes=await api.createTriadicDatabase(2026);
    await api.validateTriadicDatabase(bytes);
    const snapshot=await api.createBusinessSnapshot(bytes);
    const db=await api.openBusinessSnapshot(snapshot);db.close();
    assert.ok(api.businessSchemaDefinitions().length>0);
    assert.equal(api.initializationAttempts(),1,'成功済み本体を保ってスキーマだけ再準備');
  });
});
