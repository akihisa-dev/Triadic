import { test, expect } from "@playwright/test";

test("選択内容だけをコピーし、選び直しとコピー失敗を扱える", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.copied = text; },
    } });
  });
  await page.goto("/dev-tools/material-design/index.html?material=paper&strength=100");
  const content = page.getByRole("textbox", { name: "コピー内容" });
  const button = page.getByRole("button", { name: "選択内容をコピー", exact: true });
  const expected = `素材：マットな紙（paper）\n質感の強さ：100%\n確認URL：${page.url()}`;
  await expect(content).toHaveValue(expected);
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-copied", expected);
  await expect(page.locator("#copy-status")).toContainText("コピーしました");
  await page.getByRole("radio", { name: "金属", exact: true }).check();
  await page.getByRole("slider", { name: "質感の強さ" }).fill("35");
  await expect(page.locator("#copy-status")).toBeEmpty();
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-copied", `素材：金属（metal）\n質感の強さ：35%\n確認URL：${page.url()}`);
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: {
    writeText: async () => { throw new Error("denied"); },
  } }); });
  await button.click();
  await expect(page.locator("#copy-status")).toContainText("手動でコピー");
  await expect(content).toBeFocused();
  expect(await content.evaluate(node => {
    const field = node as HTMLTextAreaElement;
    return field.selectionEnd - field.selectionStart;
  })).toBe((await content.inputValue()).length);
});

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

test("墨色の液体の枠はライト以上の明暗差で背景から識別できる", async ({ page }) => {
  await page.goto("/dev-tools/material-design/index.html?material=liquid-smoke&strength=60");
  const contrast = async (theme: string) => page.locator(`.large-preview > .stage[data-theme="${theme}"] > .material-surface`).evaluate(node => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const channels = values.map(value => color.startsWith("color(srgb") ? value : value / 255);
      return channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);
    };
    const border = luminance(getComputedStyle(node).borderBottomColor);
    const background = luminance(getComputedStyle(node.parentElement!).backgroundColor);
    return (Math.max(border, background) + .05) / (Math.min(border, background) + .05);
  });
  const light = await contrast("light");
  expect(light).toBeGreaterThan(1.25);
  expect(await contrast("dark")).toBeGreaterThanOrEqual(light);
});
