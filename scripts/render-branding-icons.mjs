import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

// ロゴ制作専用のsharpは通常の拡張機能ビルドから分離して解決します。
const require = createRequire(process.env.TRIADIC_ART_MODULES
  ? path.join(path.resolve(process.env.TRIADIC_ART_MODULES), "package.json")
  : import.meta.url);
const sharp = require("sharp");
const root = path.resolve(import.meta.dirname, "..");
const logo = path.join(root, "branding", "logo.png");
await fs.mkdir(path.join(root, "branding", "icons"), { recursive: true });
for (const size of [16, 32, 48, 128, 512, 1024]) {
  const target = size <= 128
    ? path.join(root, "branding", "icons", `icon-${size}.png`)
    : path.join(root, "branding", `logo-${size}.png`);
  await sharp(logo)
    .resize(size, size).png().toFile(target);
  const meta = await sharp(target).metadata();
  assert.equal(meta.width, size); assert.equal(meta.height, size);
  assert.equal(meta.hasAlpha, true);
}
await fs.copyFile(path.join(root, "branding", "icons", "icon-128.png"), path.join(root, "store-listing", "images", "icon-128.png"));
console.log("Logo exports verified: transparent PNGs at 16, 32, 48, 128, 512, and 1024px.");
