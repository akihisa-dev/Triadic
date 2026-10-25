import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { OutputBundle } from "rollup";
import type { Plugin } from "vite";

/** Worker and page builds share the package roots actually present in emitted chunks. */
export function bundledNotices() {
  const roots = new Set<string>();
  const collect = (bundle: OutputBundle) => {
    for (const output of Object.values(bundle)) if (output.type === "chunk") {
      for (const id of Object.keys(output.modules)) {
        const clean = id.replace(/^\0/, "").split("?")[0]!;
        const marker = clean.lastIndexOf("/node_modules/");
        if (marker < 0) continue;
        const parts = clean.slice(marker + 14).split("/");
        const name = parts[0]!.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
        roots.add(clean.slice(0, marker + 14) + name);
      }
    }
  };
  const dependencies = async (root: string, visited = new Set<string>()) => {
    if (visited.has(root)) return;
    visited.add(root);
    const info = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    const require = createRequire(path.join(root, "package.json"));
    for (const name of Object.keys(info.dependencies ?? {})) {
      const dependency = path.dirname(require.resolve(`${name}/package.json`));
      roots.add(dependency); await dependencies(dependency, visited);
    }
  };
  const worker = (): Plugin => ({ name: "triadic-worker-notices", generateBundle: (_, bundle) => collect(bundle) });
  const main = (): Plugin => ({ name: "triadic-bundled-notices", async generateBundle(_, bundle) {
    collect(bundle);
    const notices: { name: string; text: string }[] = [];
    // Browser distributions already bundle their own transitive code, outside Rollup's module graph.
    for (const root of roots) {
      const info = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as { name: string };
      if (info.name === "jszip") await dependencies(root);
    }
    for (const root of roots) {
      const info = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as { name: string; version: string; license?: unknown };
      const files = (await fs.readdir(root)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name)).sort();
      const texts = await Promise.all(files.map(async name => `${name}\n${await fs.readFile(path.join(root, name), "utf8")}`));
      if (!files.some(name => /^(licen[sc]e|copying)(\.|$)/i.test(name))) {
        const fallback = info.name === "saxes" && info.version === "5.0.1" ? "branding/third-party/saxes-5.0.1-LICENSE"
          : info.name === "@sqlite.org/sqlite-wasm" ? "branding/sqlite-wasm-LICENSE.txt" : null;
        if (fallback) texts.push(await fs.readFile(path.resolve(fallback), "utf8"));
        else {
          const readme = (await fs.readdir(root)).find(name => /^readme(\.|$)/i.test(name));
          const text = readme ? await fs.readFile(path.join(root, readme), "utf8") : "";
          if (!/permission (is hereby granted|to use)/i.test(text)) throw new Error(`同梱依存のライセンス本文がありません: ${info.name}`);
          texts.push(`${readme}\n${text}`);
        }
      }
      if (info.name === "exceljs") {
        const vendor = JSON.parse(await fs.readFile(path.resolve("branding/third-party/exceljs-4.4.0-bundled.json"), "utf8")) as {
          package: string; bundle_sha256: string; source_map_sha256: string;
          modules: { name: string; version: string; notices: Record<string, string> }[];
        };
        const hash = async (file: string) => createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex");
        if (vendor.package !== `exceljs@${info.version}` || vendor.bundle_sha256 !== await hash("dist/exceljs.min.js") || vendor.source_map_sha256 !== await hash("dist/exceljs.min.js.map"))
          throw new Error("ExcelJS同梱ソースが変更されています。依存のライセンス表示を再照合してください。");
        for (const module of vendor.modules) texts.push(`${module.name}@${module.version} (bundled in ExcelJS)\n${Object.entries(module.notices).map(([file, text]) => `${file}\n${text}`).join("\n\n")}`);
      }
      notices.push({ name: `${info.name}@${info.version}`, text: `${info.name}@${info.version}\nLicense: ${typeof info.license === "string" ? info.license : JSON.stringify(info.license)}${info.name === "jszip" ? " (MIT selected)" : ""}\n\n${texts.join("\n\n")}` });
    }
    notices.sort((a, b) => a.name.localeCompare(b.name, "en"));
    this.emitFile({ type: "asset", fileName: "assets/THIRD-PARTY-NOTICES.txt", source: ("Bundled third-party software notices\n\n" + notices.map(item => item.text).join("\n\n--------------------\n\n")).replace(/[ \t]+$/gm, "").trimEnd() + "\n" });
  } });
  return { main, worker };
}
