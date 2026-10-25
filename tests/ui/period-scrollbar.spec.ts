import { test, expect, settleMotion, selectClassification } from "./fixtures";
import type { FrameLocator, Locator } from "@playwright/test";

// Scrollbars are the interaction under test; Chromium headless hides them by default.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function navigate(app: FrameLocator, screen: string) {
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  if (!await menu.isVisible()) await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await menu.getByRole("button", { name: screen, exact: true }).click();
  const close = app.getByRole("button", { name: "サイドバーを閉じる", exact: true });
  if (await close.count()) await close.first().click();
  await settleMotion(app.locator("body"));
}

async function targetPosition(table: Locator, period: string) {
  return table.evaluate((node, id) => {
    const region = node.closest(".initiative-list-container")!;
    const first = node.querySelector<HTMLElement>("[data-table-period]")!;
    const target = node.querySelector<HTMLElement>(`[data-table-period="${id}"]`)!;
    return Math.max(0, Math.min(region.scrollWidth - region.clientWidth,
      target.getBoundingClientRect().left - first.getBoundingClientRect().left));
  }, period);
}

for (const screen of ["総原価表", "展開表"]) {
  test.describe(screen, () => {
  test.setTimeout(60_000);
  test.beforeEach(async ({ page, app }) => {
    await page.goto("/tests/ui/preview.html?data=full");
    await expect(page.getByRole("status")).toHaveText("操作できます");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await navigate(app, screen);
    await settleMotion(app.locator("body"));
  });

  test(`${screen}はバー内だけに期間名を表示し、クリックで移動する`, async ({ page, app }) => {
    const table = app.getByRole("table", { name: screen, exact: true });
    const region = table.locator("..");
    const frame = app.locator(".period-scroll-frame");
    const rail = app.locator(".period-scrollbar");
    const mark = app.getByRole("button", { name: "Q1へ移動", exact: true });
    const undo = app.getByRole("button", { name: "操作を取り消す", exact: true });
    const disabledBefore = await undo.isDisabled();
    await expect(mark).toBeHidden();
    const before = await region.boundingBox();
    await rail.hover();
    await expect(mark).toBeVisible();
    const layout = await frame.evaluate(node => {
      const region = node.querySelector<HTMLElement>(".initiative-list-container")!;
      const regionBox = region.getBoundingClientRect();
      const rail = node.querySelector<HTMLElement>(".period-scrollbar")!.getBoundingClientRect();
      const labels = [...node.querySelectorAll<HTMLElement>(".period-scroll-mark")]
        .filter(node => getComputedStyle(node).visibility === "visible").map(node => ({ text: node.textContent, rect: node.getBoundingClientRect() }));
      return { insideGutter: rail.top >= regionBox.top + region.clientHeight - 1 && rail.bottom <= regionBox.bottom + 1,
        labelsInside: labels.every(item => item.rect.top >= rail.top - 1 && item.rect.bottom <= rail.bottom + 1 && item.rect.left >= rail.left - 1 && item.rect.right <= rail.right + 1),
        overlap: labels.some((item, i) => labels.slice(i + 1).some(other => item.rect.left < other.rect.right && other.rect.left < item.rect.right)),
        labels: labels.map(item => item.text) };
    });
    expect(layout.insideGutter).toBe(true);
    expect(layout.labelsInside).toBe(true);
    expect(layout.overlap).toBe(false);
    expect(layout.labels).toEqual(["Q1", "Q2", "上期計", "Q3", "Q4", "下期計", "年間計"]);
    expect(await region.boundingBox()).toEqual(before);
    for (const label of ["Q1", "Q2", "Q3", "Q4"]) await expect(table.getByRole("columnheader", { name: label, exact: true })).toHaveCount(1);
    const expected = await targetPosition(table, "quarter-1");
    await mark.click();
    await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollLeft) - expected)).toBeLessThan(2);
    await rail.hover();
    const annualTarget = await targetPosition(table, "annual");
    await app.getByRole("button", { name: "年間計へ移動", exact: true }).click();
    await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollLeft) - annualTarget)).toBeLessThan(2);
    expect(await undo.isDisabled()).toBe(disabledBefore);
    await app.getByRole("heading", { name: screen, exact: true }).click();
    await expect(mark).toBeHidden();
    if (page.viewportSize()!.width > 600) {
      await rail.hover();
      await page.screenshot({ path: `/tmp/triadic-${screen === "総原価表" ? "cost" : "expansion"}-period-scrollbar.png` });
    }
  });

  test(`${screen}は期間名の上からドラッグしても通常のスクロールを維持する`, async ({ page, app }) => {
    const region = app.getByRole("table", { name: screen, exact: true }).locator("..");
    const rail = app.locator(".period-scrollbar");
    await rail.hover();
    const label = app.getByRole("button", { name: "Q1へ移動", exact: true });
    const box = (await label.boundingBox())!;
    const geometry = await region.evaluate(node => ({ max: node.scrollWidth - node.clientWidth, width: node.clientWidth, left: node.scrollLeft, thumb: Math.max(24, node.clientWidth * node.clientWidth / node.scrollWidth) }));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    const expected = Math.min(geometry.max, geometry.left + 30 / (geometry.width - geometry.thumb) * geometry.max);
    await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollLeft) - expected)).toBeLessThan(2);
  });

  test(`${screen}は戻り位置・比較切替・キーボード操作を保つ`, async ({ app }) => {
    const table = app.getByRole("table", { name: screen, exact: true });
    const region = table.locator("..");
    const rail = app.locator(".period-scrollbar");
    await rail.hover();
    await app.getByRole("button", { name: "Q2へ移動", exact: true }).click();
    const target = await targetPosition(table, "quarter-2");
    await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollLeft) - target)).toBeLessThan(2);
    if (screen === "総原価表") {
      await navigate(app, "Home");
      await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
      await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollLeft) - target)).toBeLessThan(2);
    }
    await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
    await settleMotion(app.locator("body"));
    await rail.hover({ position: { x: (await rail.boundingBox())!.width - 2, y: 4 } });
    const annual = await targetPosition(table, "annual");
    await app.getByRole("button", { name: "年間計へ移動", exact: true }).click();
    await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollLeft) - annual)).toBeLessThan(2);
    const slider = app.getByRole("scrollbar", { name: `${screen}の横スクロール`, exact: true });
    await slider.press("Home");
    await expect.poll(() => region.evaluate(node => node.scrollLeft)).toBe(0);
    await slider.press("End");
    await expect.poll(() => region.evaluate(node => Math.abs(node.scrollLeft - (node.scrollWidth - node.clientWidth)))).toBeLessThan(2);
    await slider.press("Escape");
    await expect(app.locator(".period-scroll-marks")).toBeHidden();
  });
  });
}
