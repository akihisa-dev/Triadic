import { test, expect, settleMotion } from "./fixtures";
import type { Locator } from "@playwright/test";

// Compare rendered foregrounds with the actual opaque surface behind them.
async function expectReadable(locator: Locator) {
  const ratio = await locator.evaluate(node => {
    const channels = (value: string) => {
      const numbers = value.match(/[\d.]+/g)!.map(Number);
      return numbers.slice(0, 3).map(v => value.startsWith("color(srgb") ? v : v / 255);
    };
    const luminance = (value: string) => channels(value)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let background = "rgba(0, 0, 0, 0)";
    for (let parent: Element | null = node; parent; parent = parent.parentElement) {
      background = getComputedStyle(parent).backgroundColor;
      if (background !== "rgba(0, 0, 0, 0)") break;
    }
    const values = [luminance(getComputedStyle(node).color), luminance(background)].sort((a, b) => a - b);
    return (values[1]! + 0.05) / (values[0]! + 0.05);
  });
  expect(ratio, "実際の文字と背景のコントラスト").toBeGreaterThanOrEqual(4.5);
}

test("白・墨色の面と文字、青・金の操作対象、期間列の濃淡を保つ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  const toggle = app.getByRole("switch", { name: "ダークテーマ" });
  for (const dark of [false, true]) {
    await toggle.setChecked(dark);
    await settleMotion(app.locator("body"));
    await expect(app.locator(".entry-page")).toHaveCSS("background-color", dark ? "rgb(41, 41, 41)" : "rgb(247, 247, 247)");
    await expect(app.locator(".entry-page")).toHaveCSS("color", dark ? "rgb(242, 242, 242)" : "rgb(52, 52, 52)");
    await expectReadable(app.locator(".entry-drop-description"));
    await expectReadable(app.getByRole("button", { name: "ファイルを開く", exact: true }));
  }
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const nav = app.getByRole("navigation", { name: "メインナビゲーション" });
  for (const dark of [false, true]) {
    await toggle.setChecked(dark);
    const accent = dark ? "rgb(214, 184, 108)" : "rgb(0, 51, 255)";
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    const node = app.locator(".home-relation-node").first();
    await node.click();
    await expect(node.locator(".home-relation-icon")).toHaveCSS("color", accent);
    await expect(node.locator(".home-relation-name")).not.toHaveCSS("color", accent);
    await nav.getByRole("button", { name: "総原価表", exact: true }).click();
    await expect(nav.locator('[aria-current="page"] svg')).toHaveCSS("color", accent);
    const selectedKind = app.locator('.comparison-cell input:checked').first();
    await expect(selectedKind).toHaveCSS("accent-color", accent);
    await expect(app.locator('.comparison-cell:has(input:checked)').first()).toHaveCSS("border-color", accent);
    await settleMotion(app.locator("body"));
    const bands = [];
    for (const period of ["quarter", "half", "annual"]) {
      const cell = app.locator(`.cost-table .period-${period}`).first();
      await expectReadable(cell);
      bands.push(await cell.evaluate(node => getComputedStyle(node).backgroundColor));
    }
    expect(new Set(bands).size, "四半期・半期・年間の背景を区別する").toBe(3);
    await nav.getByRole("button", { name: "マスタ", exact: true }).click();
    await app.getByRole("button", { name: /^勘定科目マスタ/ }).click();
    await settleMotion(app.locator("body"));
    await expectReadable(app.locator(".master-form-label"));
    await expectReadable(app.locator(".master-count"));
    const input = app.locator(".master-data-page input").first();
    await expect(input).toHaveCSS("background-color", dark ? "rgb(52, 52, 52)" : "rgb(251, 251, 251)");
    await input.focus();
    await expect(input).toHaveCSS("outline-color", accent);
  }
});
