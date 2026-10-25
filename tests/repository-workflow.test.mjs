import { withNodeBundle } from "../scripts/node-bundle.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { projectRoot } from "../scripts/paths.mjs";

const versionFiles = [
  "package.json",
  "package-lock.json",
  "Triadic-extension/manifest.template.json",
  "Triadic-extension/manifest.json",
  "dist/extension/manifest.json",
];

test("総原価表・展開表・施策一覧照合の入口はWindows・POSIXで直接実行だけを検証し、不一致を失敗にする", async t => {
  const source = await readFile(path.join(projectRoot, "tests/report-parity.mjs"), "utf8");
  const entry = source.trim().split("\n").at(-1);
  // Run the actual production entry statement with each OS's path and URL rules.
  for (const [paths, windows, url, filename] of [
    [path.posix, false, "file:///repo/tests/report-parity.mjs", "/repo/tests/report-parity.mjs"],
    [path.win32, true, "file:///C:/repo/tests/report-parity.mjs", "C:\\repo\\tests\\report-parity.mjs"],
  ]) for (const argument of [filename, paths.join(paths.dirname(filename), "other.mjs"), undefined]) {
    let calls = 0;
    await runInNewContext(`(async () => { ${entry.replaceAll("import.meta.url", "moduleUrl")} })()`, {
      path: paths, fileURLToPath: value => fileURLToPath(value, { windows }), moduleUrl: url,
      process: { argv: ["node", argument] }, verifyReportParity: () => {},
      withNodeBundle: async () => { calls++; },
    });
    assert.equal(calls, argument === filename ? 1 : 0);
  }
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "triadic-parity-entry-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = path.join(root, "report-parity.mjs");
  await writeFile(fixture, `import path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst verifyReportParity = () => { throw new Error('照合不一致'); };\nconst withNodeBundle = async (_, operation) => operation();\n${entry}\n`);
  const direct = spawnSync(process.execPath, [fixture], { encoding: "utf8" });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /照合不一致/);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(fixture).href)})`], { encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
});

async function repository(t) {
  const root = await mkdtemp(path.join(tmpdir(), "triadic-workflow-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("GIT_")) delete env[name];
  Object.assign(env, { GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" });
  const run = (command, args, options = {}) => spawnSync(command, args, {
    cwd: root, encoding: "utf8", ...options, env: { ...env, ...options.env },
  });
  const git = (...args) => {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const script = (name, ...args) => run(process.execPath, [path.join(root, "scripts", name), ...args]);
  const setVersion = async (file, version) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), JSON.stringify(file === "package-lock.json" ? { version, packages: { "": { version } } } : { version }) + "\n");
  };
  await mkdir(path.join(root, "scripts"));
  for (const name of ["paths.mjs", "check-samples.mjs", "check-build-outputs.mjs", "check-version.mjs", "check-hooks.mjs", "setup-hooks.mjs", "version-next.mjs", "check-release.mjs"]) {
    await cp(path.join(projectRoot, "scripts", name), path.join(root, "scripts", name));
  }
  await cp(path.join(projectRoot, ".githooks"), path.join(root, ".githooks"), { recursive: true });
  for (const file of versionFiles) await setVersion(file, "1.2.0");
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Workflow Test");
  git("config", "user.email", "workflow@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("add", "--", "scripts", ".githooks", ...versionFiles);
  git("-c", `core.hooksPath=${devNull}`, "commit", "--quiet", "-m", "Initial fixture");
  return { root, run, git, script, setVersion };
}

function succeeds(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

function fails(result, message) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
}

test("Gitフックの未設定を拒否し、設定後は別ディレクトリからも確認できる", async t => {
  const repo = await repository(t);
  fails(repo.script("check-hooks.mjs"), /npm run setup:hooks/);
  succeeds(repo.script("setup-hooks.mjs"));
  succeeds(repo.script("check-hooks.mjs"));
  succeeds(repo.run(process.execPath, [path.join(repo.root, "scripts/check-hooks.mjs")], { cwd: tmpdir() }));
  assert.equal(repo.git("config", "--local", "--get", "core.hooksPath"), ".githooks");
  succeeds(repo.script("setup-hooks.mjs"));
});

test("既存の別フック設定を上書きしない", async t => {
  const repo = await repository(t);
  repo.git("config", "--local", "core.hooksPath", "custom-hooks");
  fails(repo.script("setup-hooks.mjs"), /自動では上書きしません/);
  assert.equal(repo.git("config", "--local", "--get", "core.hooksPath"), "custom-hooks");
  fails(repo.script("check-hooks.mjs"), /npm run setup:hooks/);
});

test("コミットはversion据え置きを許可し、部分更新・不一致を拒否する", async t => {
  const repo = await repository(t);
  succeeds(repo.script("setup-hooks.mjs"));
  await writeFile(path.join(repo.root, "change.txt"), "ordinary change\n");
  repo.git("add", "--", "change.txt");
  succeeds(repo.run("git", ["commit", "-m", "Keep version"]));
  const head = repo.git("rev-parse", "HEAD");
  for (const file of versionFiles.slice(0, -1)) await repo.setVersion(file, "1.2.1");
  repo.git("add", "--", ...versionFiles.slice(0, -1));
  fails(repo.run("git", ["commit", "-m", "Missing generated version"]), /versionが一致しません/);
  assert.equal(repo.git("rev-parse", "HEAD"), head);

  await repo.setVersion(versionFiles.at(-1), "1.2.2");
  repo.git("add", "--", versionFiles.at(-1));
  fails(repo.run("git", ["commit", "-m", "Mismatched version"]), /versionが一致しません/);
  assert.equal(repo.git("rev-parse", "HEAD"), head);

  await repo.setVersion(versionFiles.at(-1), "1.2.1");
  succeeds(repo.script("check-version.mjs"));
  // 作業ツリーだけ直しても、stage済みの不一致は解消した扱いにしない。
  fails(repo.script("check-version.mjs", "--staged"), /versionが一致しません/);
  repo.git("add", "--", versionFiles.at(-1));
  repo.git("commit", "--quiet", "-m", "Consistent version");
  assert.notEqual(repo.git("rev-parse", "HEAD"), head);
});

test("lockfileの内側のversion不一致は通常確認とstage確認で拒否する", async t => {
  const repo = await repository(t);
  await writeFile(path.join(repo.root, "package-lock.json"), JSON.stringify({ version: "1.2.0", packages: { "": { version: "1.2.1" } } }));
  fails(repo.script("check-version.mjs"), /root packageのversion/);
  repo.git("add", "--", "package-lock.json");
  fails(repo.script("check-version.mjs", "--staged"), /root packageのversion/);
});

test("version候補は下位桁を戻して表示し、ファイルを変更しない", async t => {
  const repo = await repository(t);
  for (const [level, expected] of [["patch", "1.2.1"], ["minor", "1.3.0"], ["major", "2.0.0"]]) {
    const result = repo.script("version-next.mjs", level);
    succeeds(result);
    assert.equal(result.stdout.trim(), expected);
  }
  for (const [sequence, expected] of [
    [["patch", "patch", "patch"], "1.2.3"],
    [["patch", "minor", "patch"], "1.3.1"],
    [["minor", "patch", "major", "patch"], "2.0.1"],
    [["major", "minor"], "2.1.0"],
  ]) {
    const result = repo.script("version-next.mjs", ...sequence);
    succeeds(result);
    assert.equal(result.stdout.trim(), expected);
  }
  fails(repo.script("version-next.mjs", "patch", "unknown"), /更新区分/);
  assert.equal(repo.git("status", "--porcelain"), "");
  fails(repo.script("version-next.mjs", "unknown"), /更新区分/);
  for (const file of versionFiles) await repo.setVersion(file, "01.2.0");
  fails(repo.script("check-version.mjs"), /MAJOR.MINOR.PATCH/);
});

test("release確認は未コミットの変更と同名tagを拒否する", async t => {
  const repo = await repository(t);
  succeeds(repo.script("check-release.mjs"));
  await writeFile(path.join(repo.root, "untracked.txt"), "pending\n");
  fails(repo.script("check-release.mjs"), /未コミットの変更/);
  await rm(path.join(repo.root, "untracked.txt"));
  repo.git("tag", "v1.2.0");
  fails(repo.script("check-release.mjs"), /tagが既に存在/);
});

test("pre-pushはブラウザ不要の検証を呼び出し、成功・失敗をpushへ返す", async t => {
  const repo = await repository(t);
  const bin = path.join(repo.root, "test-bin");
  await mkdir(bin);
  const log = path.join(repo.root, "verify-arguments.txt");
  await writeFile(path.join(bin, "npm"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$TRIADIC_HOOK_TEST_LOG"\nexit "$TRIADIC_HOOK_TEST_EXIT"\n', { mode: 0o755 });
  for (const exitCode of [0, 7]) {
    const result = repo.run("sh", [".githooks/pre-push"], {
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TRIADIC_HOOK_TEST_LOG: log, TRIADIC_HOOK_TEST_EXIT: String(exitCode) },
    });
    assert.equal(result.status, exitCode);
    assert.equal(await readFile(log, "utf8"), "run\nverify\n");
  }
});


test("親のGit環境があってもpre-pushの成功・失敗を独立したリポジトリで検証する", async t => {
  const outer = await repository(t);
  const result = spawnSync(process.execPath, ["--test", "--test-name-pattern=^pre-pushはブラウザ不要", fileURLToPath(import.meta.url)], {
    cwd: projectRoot, encoding: "utf8",
    env: { ...process.env, GIT_DIR: path.join(outer.root, ".git"), GIT_WORK_TREE: outer.root, GIT_INDEX_FILE: path.join(outer.root, ".git/index") },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(outer.git("status", "--porcelain"), "");
});

test("distの拡張機能を通常追加でき、配布ZIPと一時ファイルは除外する", async t => {
  const repo = await repository(t);
  await cp(path.join(projectRoot, ".gitignore"), path.join(repo.root, ".gitignore"));
  const artifacts = ["dist/extension/manifest.json", "dist/extension/assets/app.js", "dist/extension/src/extension/background.js"];
  const archives = ["dist/Triadic-1.1.0.zip", "dist/Triadic-1.2.0.zip", "dist/Triadic-2.0.0.zip"];
  const temporaryFiles = ["dist/.triadic-build-test/index.html", "dist/.node-bundle-test/bundle.js", "dist/home-commit-base.txt"];
  for (const file of [...artifacts, ...archives, ...temporaryFiles]) {
    await mkdir(path.dirname(path.join(repo.root, file)), { recursive: true });
    await writeFile(path.join(repo.root, file), "fixture");
  }
  repo.git("add", "--", ...artifacts);
  assert.deepEqual(repo.git("diff", "--cached", "--name-only").split("\n").sort(), [...artifacts].sort());
  for (const file of archives) {
    succeeds(repo.run("git", ["check-ignore", "--quiet", "--", file]));
    fails(repo.run("git", ["add", "--", file]), /ignored/);
    assert.equal(await readFile(path.join(repo.root, file), "utf8"), "fixture", "配布ZIPはローカルに保持する");
  }
  for (const file of temporaryFiles) succeeds(repo.run("git", ["check-ignore", "--quiet", "--", file]));
});

test("全機能確認用サンプルも除外し強制追加したコミットを拒否する", async t => {
  const repo = await repository(t);
  await cp(path.join(projectRoot, ".gitignore"), path.join(repo.root, ".gitignore"));
  await mkdir(path.join(repo.root, "samples"));
  const sample = "samples/2027年度サンプル予算.triadic";
  await writeFile(path.join(repo.root, sample), "generated sample");
  succeeds(repo.run("git", ["check-ignore", "--quiet", "--", sample]));
  fails(repo.run("git", ["add", "--", sample]), /ignored/);
  succeeds(repo.script("check-samples.mjs"));
  repo.git("add", "-f", "--", sample);
  fails(repo.script("check-samples.mjs"), /Git管理に含められません/);
  succeeds(repo.script("setup-hooks.mjs"));
  const head = repo.git("rev-parse", "HEAD");
  fails(repo.run("git", ["commit", "-m", "Sample must be rejected"]), /Git管理に含められません/);
  assert.equal(repo.git("rev-parse", "HEAD"), head);
  assert.equal(await readFile(path.join(repo.root, sample), "utf8"), "generated sample");
  repo.git("rm", "--cached", "--", sample);
  succeeds(repo.script("check-samples.mjs"));
  assert.equal(await readFile(path.join(repo.root, sample), "utf8"), "generated sample", "管理対象から外してもローカルのサンプルを保持する");
});

test("計画ファイルは大小文字とGit設定に依存せず除外し強制追加も拒否する", async t => {
  for (const ignoreCase of ["false", "true"]) for (const extension of ["triadic", "TRIADIC", "Triadic", "tRiAdIc"]) {
    const repo = await repository(t);
    repo.git("config", "core.ignorecase", ignoreCase);
    await writeFile(path.join(repo.root, ".gitignore"), await readFile(path.join(projectRoot, ".gitignore"), "utf8"));
    await mkdir(path.join(repo.root, "samples"));
    const file = `samples/check.${extension}`;
    await writeFile(path.join(repo.root, file), "local sample");
    assert.equal(repo.git("check-ignore", "--", file), file);
    fails(repo.run("git", ["add", "--", file]), /ignored/);
    succeeds(repo.script("check-samples.mjs"));
    repo.git("add", "-f", "--", file);
    fails(repo.script("check-samples.mjs"), /Git管理に含められません/);
    succeeds(repo.script("setup-hooks.mjs"));
    const head = repo.git("rev-parse", "HEAD");
    fails(repo.run("git", ["commit", "-m", "Sample must be rejected"]), /Git管理に含められません/);
    assert.equal(repo.git("rev-parse", "HEAD"), head);
    assert.equal(await readFile(path.join(repo.root, file), "utf8"), "local sample", "拒否後も元ファイルを保持する");
  }
});

test("配布ZIPは読み込み用フォルダと一致し、ソースや確認用データを含めない", async () => {
  const { default: JSZip } = await import("jszip");
  const { version } = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const zip = await JSZip.loadAsync(await readFile(path.join(projectRoot, "dist", `Triadic-${version}.zip`)), { checkCRC32: true });
  const { readdir } = await import("node:fs/promises");
  async function files(root, prefix = "") {
    const result = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) result.push(...await files(path.join(root, entry.name), name + "/"));
      else result.push(name);
    }
    return result.sort();
  }
  const root = path.join(projectRoot, "dist", "extension");
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort();
  assert.deepEqual(names, await files(root));
  assert.ok(names.includes("manifest.json"), "ZIP直下にManifestが必要");
  assert.ok(names.includes("index.html"));
  for (const name of names) {
    assert.ok(/^(?:manifest\.json|index\.html|assets\/[^/]+|icons\/icon-(?:16|32|48|128)\.png|src\/extension\/background\.js)$/.test(name), name);
    assert.ok(!/\.(?:ts|tsx|map|triadic)$/i.test(name), name);
    const bytes = await zip.files[name].async("nodebuffer");
    assert.deepEqual(bytes, await readFile(path.join(root, name)), name);
    assert.deepEqual(bytes, await readFile(path.join(projectRoot, "Triadic-extension", name)), name);
  }
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.equal(manifest.version, version);
  assert.ok(names.includes(manifest.background.service_worker));
});

// #28: preparation and switching errors must leave the previous coherent outputs.
test("配布物のコピー・ZIP書込み・切替失敗では旧版へ復元する", async t => {
  const fs = await import("node:fs/promises");
  const { replaceBuildOutputs } = await import("../scripts/replace-build-outputs.mjs");
  for (const mode of ["copy", "write", "switch", "validate", "success"]) {
    const root = await mkdtemp(path.join(tmpdir(), "triadic-build-rollback-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const old = path.join(root, "extension"), next = path.join(root, "staging");
    for (const [directory, version] of [[old, "old"], [next, "new"]]) {
      await mkdir(path.join(directory, "assets"), { recursive: true });
      await writeFile(path.join(directory, "index.html"), `assets/${version}.js`);
      await writeFile(path.join(directory, "assets", `${version}.js`), version);
    }
    await writeFile(path.join(root, "source.ts"), "source unchanged");
    await writeFile(path.join(root, "test.triadic"), "data unchanged");
    const archive = path.join(root, "current.zip"); await writeFile(archive, "old zip");
    await writeFile(path.join(root, "older.zip"), "older zip");
    let copies = 0, renames = 0;
    const io = { ...fs,
      cp: async (source, target, options) => {
        if (mode === "copy" && ++copies === 2) { await writeFile(target, "partial"); throw new Error("copy failure"); }
        await fs.cp(source, target, options);
      },
      writeFile: async (target, bytes) => {
        if (mode === "write") { await fs.writeFile(target, "partial zip"); throw new Error("write failure"); }
        await fs.writeFile(target, bytes);
      },
      rename: async (source, target) => {
        if (mode === "switch" && ++renames === 6) throw new Error("switch failure");
        await fs.rename(source, target);
      },
    };
    const entries = ["index.html", "assets"].map(relative => ({ source: path.join(next, relative), target: path.join(old, relative) }));
    entries.push({ bytes: Buffer.from("new zip"), target: archive });
    const operation = replaceBuildOutputs(entries, { io,
      validateInstalled: async () => { if (mode === "validate") throw new Error("validation failure"); },
    });
    if (mode === "success") await operation;
    else await assert.rejects(operation, /failure/);
    const version = mode === "success" ? "new" : "old";
    assert.equal(await readFile(path.join(old, "index.html"), "utf8"), `assets/${version}.js`);
    assert.equal(await readFile(path.join(old, "assets", `${version}.js`), "utf8"), version);
    assert.equal(await readFile(archive, "utf8"), `${version} zip`);
    for (const [name, expected] of [["source.ts", "source unchanged"], ["test.triadic", "data unchanged"], ["older.zip", "older zip"]])
      assert.equal(await readFile(path.join(root, name), "utf8"), expected);
    assert.ok(!(await fs.readdir(root)).some(name => name.startsWith(".triadic-replace-")));
    assert.ok(!(await fs.readdir(old)).some(name => name.startsWith(".triadic-replace-")));
  }
});

test("配布物の復元も失敗した場合は旧版の退避先を残す", async t => {
  const fs = await import("node:fs/promises");
  const { replaceBuildOutputs } = await import("../scripts/replace-build-outputs.mjs");
  const root = await mkdtemp(path.join(tmpdir(), "triadic-backup-retained-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "current.zip"); await writeFile(target, "old zip");
  const io = { ...fs, rename: async (source, destination) => {
    if (path.basename(source) === "next" || path.basename(source) === "previous") throw new Error("rename failure");
    await fs.rename(source, destination);
  } };
  await assert.rejects(replaceBuildOutputs([{ target, bytes: Buffer.from("new zip") }], { io }), /退避先/);
  const backup = (await fs.readdir(root)).find(name => name.startsWith(".triadic-replace-"));
  assert.equal(await readFile(path.join(root, backup, "previous"), "utf8"), "old zip");
});


test("再生成した両配布物と送信コミットの一致を確認し、漏れを表示する", async t => {
  const repo = await repository(t);
  const outputs = ["Triadic-extension/assets/app.js", "dist/extension/assets/app.js"];
  for (const file of outputs) { await mkdir(path.dirname(path.join(repo.root, file)), { recursive: true }); await writeFile(path.join(repo.root, file), "old"); }
  await writeFile(path.join(repo.root, "source.ts"), "old");
  repo.git("add", "--", ...outputs, "source.ts"); repo.git("commit", "--quiet", "-m", "Build fixture");
  succeeds(repo.script("check-build-outputs.mjs"));
  // A source-only commit followed by successful regeneration leaves the commit's outputs stale.
  await writeFile(path.join(repo.root, "source.ts"), "new");
  repo.git("add", "--", "source.ts"); repo.git("commit", "--quiet", "-m", "Source only");
  const sourceOnly = repo.git("rev-parse", "HEAD");
  for (const file of outputs) await writeFile(path.join(repo.root, file), "new");
  fails(repo.script("check-build-outputs.mjs"), /assets\/app.js/);
  repo.git("add", "--", outputs[0]); repo.git("commit", "--quiet", "-m", "One distribution only");
  fails(repo.script("check-build-outputs.mjs"), /dist\/extension\/assets\/app.js/);
  repo.git("add", "--", outputs[1]); repo.git("commit", "--quiet", "-m", "Both outputs");
  succeeds(repo.script("check-build-outputs.mjs"));
  const head = repo.git("rev-parse", "HEAD");
  const index = repo.git("write-tree");
  const oldPush = repo.run(process.execPath, ["scripts/check-build-outputs.mjs", "--push"], { input: `refs/heads/main ${sourceOnly} refs/heads/main ${"0".repeat(40)}\n` });
  fails(oldPush, /一致しません/);
  const goodPush = repo.run(process.execPath, ["scripts/check-build-outputs.mjs", "--push"], { input: `refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n` });
  succeeds(goodPush);
  const extra = "dist/extension/assets/missing.js"; await writeFile(path.join(repo.root, extra), "new");
  fails(repo.script("check-build-outputs.mjs"), /missing.js/);
  assert.equal(repo.git("write-tree"), index, "既存のstageを変更しない");
  assert.equal(repo.git("rev-parse", "HEAD"), head, "勝手にコミットしない");
  assert.equal(await readFile(path.join(repo.root, extra), "utf8"), "new");
});


test("ストア原稿の名前・説明・ポリシーURLの不一致と欠落を拒否する", async t => {
  const { checkStoreListingText } = await import('../scripts/store-listing-text.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'triadic-listing-text-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'store-listing');
  await cp(path.join(projectRoot, 'store-listing'), directory, { recursive: true });
  await mkdir(path.join(root, 'Triadic-extension'));
  await cp(path.join(projectRoot, 'Triadic-extension/manifest.template.json'), path.join(root, 'Triadic-extension/manifest.template.json'));
  await checkStoreListingText(root);
  for (const [name, change] of [
    ['listing-ja.txt', text => text.replace('【名前】\nTriadic', '【名前】\n別の名前')],
    ['listing-ja.txt', text => text.replace('【短い説明】\n', '【短い説明】\n不一致')],
    ['privacy-policy-url.txt', () => 'https://example.invalid/other'],
    ['privacy-practices.md', text => text.replaceAll('https://gist.github.com/', 'https://example.invalid/')],
    ['README.md', text => text.replaceAll('https://gist.github.com/', 'https://example.invalid/')],
  ]) {
    const file = path.join(directory, name), original = await readFile(file, 'utf8');
    await writeFile(file, change(original));
    await assert.rejects(checkStoreListingText(root), /一致しません/);
    await writeFile(file, original);
  }
  await rm(path.join(directory, 'privacy-policy-url.txt'));
  await assert.rejects(checkStoreListingText(root), /ENOENT/);
  await checkStoreListingText(projectRoot);
});

test("画面確認データは選んだ種類だけを一度生成し、切替と失敗後の再試行を保持する", async () => {
  await withNodeBundle("tests/ui/lazy-fixtures.ts", async ({ lazyFixtures }) => {
    const calls = { empty: 0, legacy: 0, defaults: 0, full: 0 };
    const source = Object.fromEntries(Object.keys(calls).map((name, index) => [name, async () => { calls[name]++; return [index, 0, 255]; }]));
    const load = lazyFixtures(source);
    const empty = load("empty");
    assert.equal(load("empty"), empty, "同じ初回生成を共有");
    assert.deepEqual(await empty, [0, 0, 255]);
    assert.equal(calls.full, 0, "空データの準備ではフルサンプルを生成しない");
    for (const name of Object.keys(calls)) {
      const value = await load(name);
      assert.equal(await load(name), value, "切替後の再選択とリセットで生成結果を再利用");
      assert.deepEqual(value, await source[name]());
      assert.equal(calls[name], 2, "初回と比較用の明示生成だけ");
    }
    let attempts = 0;
    const retry = lazyFixtures({ empty: async () => { if (++attempts === 1) throw Error("準備失敗"); return [1]; } });
    await assert.rejects(retry("empty"), /準備失敗/);
    assert.deepEqual(await retry("empty"), [1]);
  });
});

test("配布用フォルダーと正式ZIPに固定依存の著作権・ライセンス表示を含める", async () => {
  const { default: JSZip } = await import("jszip");
  const noticePath = "assets/THIRD-PARTY-NOTICES.txt";
  const dist = await readFile(path.join(projectRoot, "dist/extension", noticePath), "utf8");
  assert.equal(await readFile(path.join(projectRoot, "Triadic-extension", noticePath), "utf8"), dist);
  for (const name of ["react", "react-dom", "exceljs", "jszip", "saxes", "scheduler", "pako"]) {
    const directory = path.join(projectRoot, "node_modules", name);
    const info = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    assert.ok(dist.includes(`${info.name}@${info.version}`), `${name}の同梱版`);
    const { readdir } = await import("node:fs/promises");
    for (const file of (await readdir(directory)).filter(file => /^(licen[sc]e|copying|notice)(\.|$)/i.test(file)))
      assert.ok(dist.includes((await readFile(path.join(directory, file), "utf8")).replace(/[ \t]+$/gm, "").trimEnd()), `${name}の${file}の全文`);
  }
  const version = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")).version;
  const archive = await JSZip.loadAsync(await readFile(path.join(projectRoot, `dist/Triadic-${version}.zip`)));
  assert.equal(await archive.file(noticePath).async("string"), dist);
  assert.ok(archive.file("assets/sqlite-wasm-LICENSE.txt"));
});

test("ExcelJSの事前同梱依存72組の原文も配布し、本文の対応情報を保持する", async () => {
  const vendor = JSON.parse(await readFile(path.join(projectRoot, "branding/third-party/exceljs-4.4.0-bundled.json"), "utf8"));
  const notice = await readFile(path.join(projectRoot, "dist/extension/assets/THIRD-PARTY-NOTICES.txt"), "utf8");
  assert.equal(vendor.modules.length, 72);
  for (const module of vendor.modules) {
    assert.ok(module.version && module.verified_sources.length && module.verification);
    for (const text of Object.values(module.notices)) assert.ok(notice.includes(text.replace(/[ \t]+$/gm, "").trimEnd()));
  }
});
