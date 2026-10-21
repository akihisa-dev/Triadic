import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "store-listing");
const screenshotNames = ["01-initiatives", "02-initiative", "03-cost", "04-breakdown", "05-entry"];
const images = [
  ["images/icon-128.png", 128, 128, true],
  ["images/promo-small-440x280.png", 440, 280, false],
  ["images/promo-marquee-1400x560.png", 1400, 560, false],
  ...screenshotNames.map(name => [`screenshots/${name}-1280x800.png`, 1280, 800, false]),
];
const textFiles = ["README.md", "listing-ja.txt", "privacy-practices.md", "privacy-policy.md", "reviewer-instructions.txt"];
const version = JSON.parse(await fs.readFile(path.join(root, "package.json"))).version;

async function check() {
  for (const name of textFiles) assert.ok((await fs.readFile(path.join(output, name), "utf8")).trim(), name);
  const receipt = JSON.parse(await fs.readFile(path.join(output, "assets.json")));
  assert.equal(receipt.version, version, "画面の版が現在の版と一致しません。撮影し直してください。");
  for (const [name, width, height, alpha] of images) {
    const bytes = await fs.readFile(path.join(output, name));
    const png = PNG.sync.read(bytes);
    assert.equal(png.width, width, name); assert.equal(png.height, height, name);
    assert.equal(bytes[25], alpha ? 6 : 2, `${name}: PNGの色形式`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.images[name], `${name}: 撮影後の変更`);
  }
  const files = await fs.readdir(output, { recursive: true });
  assert.ok(!files.some(name => /\.(zip|triadic)$/i.test(name)), "掲載フォルダに配布物・計画ファイルを含めません。");
  console.log(`store listing ok: ${images.length} PNGs, text, version and SHA-256; no ZIP or plan files`);
}

if (process.argv.includes("--check")) {
  await check();
} else {
  await fs.mkdir(path.join(output, "images"), { recursive: true });
  await fs.mkdir(path.join(output, "screenshots"), { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "ja-JP", colorScheme: "light", reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(process.env.TRIADICHROME_CAPTURE_URL ?? "http://127.0.0.1:4187/");
    await page.getByRole("button", { name: "新規作成", exact: true }).waitFor();
    assert.equal(await page.title(), "Triadichrome");
    await page.getByLabel(`バージョン ${version}`, { exact: true }).waitFor();

    async function capture(name) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        await Promise.all(document.getAnimations().filter(animation => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      });
      const bytes = await page.screenshot({ animations: "disabled" });
      const decoded = PNG.sync.read(bytes);
      await fs.writeFile(path.join(output, `screenshots/${name}-1280x800.png`), PNG.sync.write(decoded, { colorType: 2 }));
    }
    await capture("05-entry");
    // 架空データのみ。通常画面をそのまま撮影し、実ファイル・利用者の保存領域は使わない。
    await page.evaluate(async () => {
      const { createSamplePlan } = await import("/tests/ui/sample-plan.ts");
      const bytes = await createSamplePlan(2026, false);
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle("掲載用サンプル.triadic", { create: true });
      const writer = await handle.createWritable(); await writer.write(bytes); await writer.close();
      Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: async () => [handle] });
    });
    await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await page.getByRole("button", { name: "サイドバーを開く", exact: true }).waitFor();
    async function navigate(name) {
      const open = page.getByRole("button", { name: "サイドバーを開く", exact: true });
      if (await open.isVisible()) await open.click();
      await page.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name, exact: true }).click();
      await page.getByRole("heading", { name, exact: true }).waitFor();
      const close = page.locator(".home-header").getByRole("button", { name: "サイドバーを閉じる", exact: true });
      if (await close.isVisible()) await close.click();
    }
    await navigate("施策一覧");
    await capture("01-initiatives");
    await page.getByRole("button", { name: "設備更新と償却費の見直し", exact: true }).click();
    await page.getByRole("textbox", { name: "施策名", exact: true }).waitFor();
    await capture("02-initiative");
    await navigate("総原価表");
    await page.getByRole("table", { name: "総原価表", exact: true }).waitFor();
    await capture("03-cost");
    await navigate("展開表");
    await page.getByRole("table", { name: "展開表", exact: true }).waitFor();
    await capture("04-breakdown");
    assert.deepEqual(errors, [], "ブラウザエラー");

    await fs.copyFile(path.join(root, "branding/icons/icon-128.png"), path.join(output, "images/icon-128.png"));
    await page.goto(pathToFileURL(path.join(root, "store-listing/source/layouts.html")).href);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.locator("img").evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0)));
    for (const [id, filename] of [["promo-small", "promo-small-440x280.png"], ["promo-marquee", "promo-marquee-1400x560.png"]]) {
      const bytes = await page.locator(`#${id}`).screenshot({ animations: "disabled" });
      await fs.writeFile(path.join(output, "images", filename), PNG.sync.write(PNG.sync.read(bytes), { colorType: 2 }));
    }
    const hashes = {};
    for (const [name] of images) hashes[name] = createHash("sha256").update(await fs.readFile(path.join(output, name))).digest("hex");
    await fs.writeFile(path.join(output, "assets.json"), JSON.stringify({ version, capturedAt: new Date().toISOString(), viewport: "1280x800", source: "ローカルWeb表示・架空サンプル・Chrome", images: hashes }, null, 2) + "\n");
  } finally {
    await browser.close();
  }
  await check();
}
