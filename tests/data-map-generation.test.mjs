import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createModuleResolver, describeSchema, mechanismImplementations, screenImplementations, staleScreens } from "../scripts/data-map.mjs";
import { withNodeBundle } from "../scripts/node-bundle.mjs";
import { projectRoot } from "../scripts/paths.mjs";

test("実際の画面・仕組みの依存グラフと確認用ハッシュがPOSIX・Windowsで一致する", async () => {
  const read = file => readFile(path.join(projectRoot, file), "utf8");
  const resolvers = [path.posix, path.win32].map(pathApi => {
    const root = pathApi === path.win32 ? "C:\\repo" : "/repo";
    return createModuleResolver({ root, pathApi, exists: file =>
      access(path.join(projectRoot, pathApi.relative(root, file).split(pathApi.sep).join("/"))) });
  });
  const screens = await screenImplementations(read);
  await withNodeBundle("Triadichrome-extension/src/extension/mechanismModel.ts", async ({ mechanisms }) => {
    const topics = await mechanismImplementations(mechanisms, read);
    for (const resolve of resolvers) {
      assert.deepEqual(await screenImplementations(read, resolve), screens);
      assert.deepEqual(await mechanismImplementations(mechanisms, read, resolve), topics);
    }
  });
});

test("両OSで相対import・再export・動的import・Worker・循環を追跡し、不正参照を拒否する", async () => {
  const prefix = "Triadichrome-extension/src/";
  const files = new Map([
    [prefix + "extension/HomePage.tsx", "export const HomePage = null;"],
    [prefix + "extension/WorkspacePage.tsx", 'import { Entry } from "../core/entry"; switch (displayed.page) { case "test": return <Entry />; }'],
    [prefix + "extension/useHomeWorkspace.tsx", "export const controller = null;"],
    [prefix + "extension/ExtensionPage.tsx", "export const extension = null;"],
    [prefix + "extension/MechanismMap.tsx", "export const map = null;"],
    [prefix + "extension/HomeRelationsPage.tsx", "export const relations = null;"],
    [prefix + "core/storage/readPlan.ts", "export const plan = null;"],
    [prefix + "core/entry.ts", 'import "./relative"; export { value } from "./barrel"; import("./dynamic.ts"); new Worker(new URL("./worker.ts", import.meta.url)); import "./storage/dataMapSchema.generated"; import type { Ignored } from "./typeOnly";'],
    [prefix + "core/relative.ts", 'import "./entry"; export const relative = 1;'],
    [prefix + "core/barrel/index.ts", "export const value = 1;"],
    [prefix + "core/dynamic.ts", "export const dynamic = 1;"],
    [prefix + "core/worker.ts", "export const worker = 1;"],
    [prefix + "core/typeOnly.ts", "export type Ignored = number;"],
    [prefix + "core/storage/dataMapSchema.generated.ts", "export const generated = 1;"],
    ["outside.ts", "export const outside = 1;"],
  ]);
  const read = async file => {
    assert.ok(!file.includes("\\"), "読み取りと依存グラフにはスラッシュ区切りの識別子を渡す");
    if (!files.has(file)) throw Object.assign(new Error(file), { code: "ENOENT" });
    return files.get(file);
  };
  const topics = [{ id: "test", sources: [prefix + "core/entry.ts"] }];
  const hashes = [];
  for (const pathApi of [path.posix, path.win32]) {
    const root = pathApi === path.win32 ? "C:\\repo" : "/repo";
    const resolve = createModuleResolver({ root, pathApi, exists: async file => {
      if (!files.has(pathApi.relative(root, file).split(pathApi.sep).join("/"))) throw new Error("missing");
    } });
    assert.equal(await resolve(prefix + "core/entry.ts", "./barrel"), prefix + "core/barrel/index.ts");
    assert.equal(await resolve(prefix + "core/entry.ts", "react"), null);
    const screen = await screenImplementations(read, resolve);
    const mechanism = await mechanismImplementations(topics, read, resolve);
    hashes.push({ screen, mechanism });
    for (const file of ["relative.ts", "barrel/index.ts", "dynamic.ts", "worker.ts"]) {
      const changed = async id => (await read(id)) + (id === prefix + "core/" + file ? "\n// changed" : "");
      assert.notDeepEqual(await screenImplementations(changed, resolve), screen, file);
      assert.notDeepEqual(await mechanismImplementations(topics, changed, resolve), mechanism, file);
    }
    const excluded = async id => (await read(id)) + (/typeOnly|dataMapSchema\.generated/.test(id) ? "\n// changed" : "");
    assert.deepEqual(await screenImplementations(excluded, resolve), screen);
    const missing = async id => { if (id.endsWith("/worker.ts")) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return read(id); };
    await assert.rejects(mechanismImplementations(topics, missing, resolve), { code: "ENOENT" });
    for (const invalid of ["outside.ts", prefix + "core/../../outside.ts"]) {
      await assert.rejects(mechanismImplementations([{ id: "invalid", sources: [invalid] }], read, resolve), /実装参照が不正/);
    }
    await assert.rejects(mechanismImplementations(topics, async id => (await read(id)) +
      (id.endsWith("/entry.ts") ? '\nimport "../../../outside";' : ""), resolve), /実装参照が不正/);
  }
  assert.deepEqual(hashes[0], hashes[1]);
});

test("保存項目の追加・削除・参照先変更を説明用の表へ自動反映する", async () => {
  const SQL = await withNodeBundle("Triadichrome-extension/src/core/storage/sqliteRuntime.ts", ({ initializeSqlite }) => initializeSqlite());
  const database = new SQL.Database();
  try {
    database.run("CREATE TABLE owners (id INTEGER PRIMARY KEY); CREATE TABLE children (owner_id INTEGER REFERENCES owners(id), obsolete TEXT);");
    database.run("ALTER TABLE children DROP COLUMN obsolete; ALTER TABLE children ADD COLUMN new_amount INTEGER; CREATE TABLE newer (child_id INTEGER REFERENCES children(new_amount));");
    const schema = describeSchema(database);
    assert.deepEqual(schema.find(table => table.name === "children").columns, [{ name: "owner_id", reference: "owners.id" }, { name: "new_amount" }]);
    await withNodeBundle("Triadichrome-extension/src/core/storage/dataMapDescription.ts", ({ describeDataTables }) => {
      const described = describeDataTables(schema, {}, {});
      assert.equal(described.find(table => table.name === "newer").columns[0].reference, "children.new_amount");
      assert.equal(described.find(table => table.name === "children").columns[1].label, "new_amount", "新しい項目は日本語名の登録前でも表示する");
      assert.ok(!described.find(table => table.name === "children").columns.some(column => column.name === "obsolete"));
    });
  } finally { database.close(); }
});

test("画面・計算・接続・対応説明の変更と画面の追加漏れを検出する", async () => {
  const read = file => readFile(path.join(projectRoot, file), "utf8");
  const implementations = await screenImplementations(read);
  const renamedVariable = await screenImplementations(async file => {
    const text = await read(file);
    return file.endsWith('/WorkspacePage.tsx') ? text.replace('switch (displayed.page)', 'switch (retainedScreen.page)') : text;
  });
  assert.deepEqual(Object.keys(renamedVariable), Object.keys(implementations), '画面識別はローカル変数の名称に依存しない');
  await assert.rejects(screenImplementations(async file => {
    const text = await read(file);
    return file.endsWith('/WorkspacePage.tsx') ? text.replace('switch (displayed.page)', 'switch (displayed.unknown)') : text;
  }), /切り替え実装/, '描画分岐を取得できなければ確認を止める');
  for (const [before, after, error] of [
    ['switch (displayed.page)', 'switch (displayed.page) {} switch (displayed.page)', /切り替え実装/],
    ['case "initiative-list":', 'case "cost-table":', /識別子/],
    ['case "initiative-list":', 'case unknownPage:', /識別子/],
  ]) await assert.rejects(screenImplementations(async file => {
    const text = await read(file);
    return file.endsWith('/WorkspacePage.tsx') ? text.replace(before, after) : text;
  }), error, '曖昧・重複・非定数の描画分岐は確認を止める');
  const review = JSON.parse(await read("Triadichrome-extension/src/extension/screenDataReview.json"));
  await withNodeBundle("Triadichrome-extension/src/extension/screenDataModel.ts", async ({ screenData }) => {
    assert.deepEqual(staleScreens(review, implementations, screenData), []);
    const changed = await screenImplementations(async file => {
      const text = await read(file);
      if (!file.endsWith("/InitiativeListPage.tsx")) return text;
      const mutated = text.replace(">{item.name}", ">{item.note}");
      assert.notEqual(mutated, text, "表示元の変更をテスト用に適用できていること");
      return mutated;
    });
    assert.ok(staleScreens(review, changed, screenData).includes("initiative-list"), "画面の表示元変更を検出する");
    const calculation = await screenImplementations(async file => {
      const text = await read(file);
      return file.endsWith("/kinds.ts") ? text.replace("if (kind === 1)", "if (kind === 2)") : text;
    });
    assert.ok(staleScreens(review, calculation, screenData).includes("initiative-list"), "間接的に使う計算規則の変更も検出する");
    const wiring = await screenImplementations(async file => {
      const text = await read(file);
      return file.endsWith("/WorkspacePage.tsx") ? text.replace("workspace.localKinds[", "contents.kindSelections[") : text;
    });
    assert.ok(staleScreens(review, wiring, screenData).includes("initiative-list"), "親画面から渡す表示元の変更も検出する");
    for (const source of ["HomePage.tsx", "WorkspacePage.tsx", "useHomeWorkspace.tsx", "planProcessing.worker.ts", "planProcessingTasks.ts"]) {
      const deferred = await screenImplementations(async file => {
        const text = await read(file);
        if (!file.endsWith("/" + source)) return text;
        return source === "WorkspacePage.tsx"
          ? text.replace("const { accounts, initiatives } = contents;", "const { accounts, initiatives } = workspace.currentContents;")
          : text + "\n// Changed implementation\n";
      });
      assert.ok(staleScreens(review, deferred, screenData).includes("initiative-list"), source + "の変更も検出する");
    }
    const renamed = await screenImplementations(async file => {
      const text = await read(file);
      return file.endsWith("/WorkspacePage.tsx") ? text.replace('case "initiative-list":', 'case "new-screen":') : text;
    });
    assert.ok(staleScreens(review, renamed, screenData).includes("new-screen"), "新しい描画分岐に対応説明が必要");
    assert.ok(staleScreens(review, renamed, screenData).includes("initiative-list"), "削除した描画分岐も検出する");
    assert.ok(staleScreens(review, implementations, screenData.filter(screen => screen.page !== "initiative-list")).includes("initiative-list"));
    const descriptions = screenData.map(screen => screen.page === "initiative-list" ? { ...screen, calculated: ["新しい説明"] } : screen);
    assert.ok(staleScreens(review, implementations, descriptions).includes("initiative-list"));
  });
});
