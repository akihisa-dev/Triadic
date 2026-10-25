import { test, expect, settleMotion } from "./fixtures";
import { PNG } from "pngjs";
import type { Locator } from "@playwright/test";

async function edgeContrast(cell: Locator, edge: "Left" | "Bottom") {
  return cell.evaluate((node, edge) => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        .map(value => color.startsWith("color(srgb") ? value : value / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    };
    const style = getComputedStyle(node);
    let background = style.backgroundColor;
    for (let parent = node.parentElement; background === "rgba(0, 0, 0, 0)" && parent; parent = parent.parentElement) background = getComputedStyle(parent).backgroundColor;
    const values = [luminance(background), luminance(style[`border${edge}Color`])].sort((a, b) => a - b);
    return { ratio: (values[1]! + 0.05) / (values[0]! + 0.05), width: style[`border${edge}Width`] };
  }, edge);
}

test("期間列の通常罫線が背景へ埋もれず、月・期間の境界はさらに明確", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const nav = app.getByRole("navigation", { name: "メインナビゲーション" });
  for (const route of ["総原価表", "展開表"]) {
    await nav.getByRole("button", { name: route, exact: true }).click();
    const table = app.getByRole("table", { name: route, exact: true });
    for (const dark of [false, true]) {
      await app.getByRole("switch", { name: "ダークテーマ" }).setChecked(dark);
      await settleMotion(app.locator("body"));
      for (const period of ["quarter", "half", "annual"]) {
        const cell = table.locator(`tbody tr:not(.cost-subtotal):not(.expansion-subtotal):not(.expansion-total):not(.expansion-previous) td.period-${period}.period-start`).first();
        const row = await edgeContrast(cell, "Bottom");
        const boundary = await edgeContrast(cell, "Left");
        expect(row.width).toBe("1px");
        // A product readability floor, not an accessibility-text contrast rule.
        expect(row.ratio, `${route} ${period}の通常行`).toBeGreaterThanOrEqual(1.25);
        expect(boundary.width).toBe("1px");
        expect(boundary.ratio, `${route} ${period}の期間境界`).toBeGreaterThan(row.ratio);
        const previous = cell.locator("xpath=preceding-sibling::*[1]");
        await expect(previous).toHaveCSS("border-right-width", "0px");
      }
    }
  }
});

test("狭幅の合計ラベルにも固定部分の右端の線が残る", async ({ page, app }) => {
  await page.setViewportSize({ width: 375, height: 1155 });
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  for (const route of ["施策一覧", "展開表"]) {
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: route, exact: true }).click();
    await app.locator(".home-header").getByRole("button", { name: /サイドバー/ }).press("Escape");
    await page.mouse.move(370, 350);
    for (const dark of [false, true]) {
      await app.getByRole("switch", { name: "ダークテーマ" }).setChecked(dark);
      await settleMotion(app.locator("body"));
      const label = app.locator(route === "施策一覧" ? ".initiative-total-label" : ".expansion-summary").first();
      const edge = await label.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const name = node.closest("table")!.querySelector(".initiative-list-name, .expansion-name")!;
        return { x: rect.left + name.getBoundingClientRect().width - 1, y: rect.top + rect.height / 2 };
      });
      const frame = (await page.locator("#app-preview").boundingBox())!;
      edge.x += frame.x; edge.y += frame.y;
      const picture = PNG.sync.read(await page.screenshot());
      const pixel = (x: number) => {
        const offset = (Math.floor(edge.y) * picture.width + Math.floor(x)) * 4;
        return [...picture.data.slice(offset, offset + 3)];
      };
      const interior = pixel(edge.x - 4);
      // Check the painted edge after clipping, not just the declared CSS border.
      const differences = [-1, 0, 1].map(offset => Math.max(...pixel(edge.x + offset).map((value, i) => Math.abs(value - interior[i]!))));
      expect(Math.max(...differences), `${route}の固定境界が実際に描画される`).toBeGreaterThan(30);
    }
  }
});
