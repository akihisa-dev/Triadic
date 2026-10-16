import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { projectRoot } from "./paths.mjs";

// These are the build-owned paths synchronized by build.mjs, in both distributions.
const paths = ["dist/extension", ...["manifest.json", "index.html", "assets", "icons", "src/extension/background.js"].map(name => `Triadichrome-extension/${name}`)];
const git = (...args) => execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" });
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--push")) throw new Error("引数は --push のみ指定できます。");
const input = args[0] === "--push" ? readFileSync(0, "utf8").trim() : "";
const commits = input ? [...new Set(input.split(/\r?\n/).map(line => line.split(/\s+/)[1]).filter(sha => sha && !/^0+$/.test(sha)))] : ["HEAD"];
const untracked = git("ls-files", "--others", "--exclude-standard", "--", ...paths).trim();
const failures = [];
for (const commit of commits) {
  const changed = git("diff", "--name-only", commit, "--", ...paths).trim();
  if (changed || untracked) failures.push(`${commit}\n${[changed, untracked].filter(Boolean).join("\n")}`);
}
if (failures.length) throw new Error(`再生成した配布物が送信するコミットと一致しません。次の対象を確認し、必要な配布物をコミットしてください。自動でstage・commitは行いません。\n${failures.join("\n")}`);
console.log("build outputs ok: 再生成した配布物と送信するコミットが一致");
