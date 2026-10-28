import { test, expect } from "@playwright/test";

test("素材と強さを比較し、同じURLで選択を復元してダイアログを確認できる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/dev-tools/index.html");
  await page.getByRole("link", { name: "素材感の比較", exact: true }).click();
  await expect(page).toHaveTitle("Triadic 素材感の比較");
  const light = page.getByRole("region", { name: "ライトの素材感見本" });
  const dark = page.getByRole("region", { name: "ダークの素材感見本" });
  await expect(page.getByRole("radio", { name: "マットな紙", exact: true })).toBeChecked();
  for (const [label, value] of [["なし", "none"], ["すりガラス", "glass"], ["金属", "metal"], ["リキッドスモーク", "liquid-smoke"], ["マットな紙", "paper"]]) {
    await page.getByRole("radio", { name: label!, exact: true }).check();
    await expect(light.locator(":scope > .stage")).toHaveAttribute("data-material", value!);
    await expect(dark.locator(":scope > .stage")).toHaveAttribute("data-material", value!);
    await expect(page.getByRole("heading", { name: label!, exact: true })).toBeVisible();
  }
  await page.getByRole("slider", { name: "質感の強さ" }).fill("85");
  await expect(page).toHaveURL(/material=paper&strength=85/);
  await page.reload();
  await expect(page.getByRole("radio", { name: "マットな紙", exact: true })).toBeChecked();
  await expect(page.getByRole("slider", { name: "質感の強さ" })).toHaveValue("85");
  await expect(page.getByRole("status", { name: "選択中の素材感" })).toHaveText("強さ 85%");
  const surface = light.locator(":scope > .stage > .material-surface");
  const opacity = await surface.evaluate(node => getComputedStyle(node, "::before").opacity);
  await page.getByRole("slider", { name: "質感の強さ" }).fill("0");
  expect(await surface.evaluate(node => getComputedStyle(node, "::before").opacity)).not.toBe(opacity);
  await expect(dark.locator(":scope > .stage")).toHaveCSS("color", "rgb(242, 242, 242)");
  await dark.getByRole("button", { name: "ダイアログを確認" }).click();
  const dialog = dark.getByRole("dialog", { name: "素材感のダイアログ" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await page.getByText("仕様カラーパレット", { exact: true }).click();
  await expect(page.locator("#palette")).toContainText("#F7F7F7");
  await expect(page.locator("#palette")).toContainText("#292929");
  expect(await page.locator("body").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("不明な素材や不正な強さを含むURLでも表示できる", async ({ page }) => {
  await page.goto("/dev-tools/material-design/index.html?material=unknown&strength=invalid");
  await expect(page.getByRole("radio", { name: "マットな紙", exact: true })).toBeChecked();
  await expect(page.getByRole("slider", { name: "質感の強さ" })).toHaveValue("60");
});
