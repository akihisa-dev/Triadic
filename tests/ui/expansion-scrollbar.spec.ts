import { test, expect, settleMotion } from "./fixtures";
import type { FrameLocator } from "@playwright/test";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
async function open(app: FrameLocator) {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "展開表", exact: true }).click();
  const close = app.getByRole("button", { name: "サイドバーを閉じる", exact: true });
  if (await close.count()) await close.first().click();
  await settleMotion(app.locator("body"));
}

test("展開名を縦バー内に表示し、先頭行へ移動しても横位置と金額を変えない", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await open(app);
  const table = app.getByRole("table", { name: "展開表", exact: true });
  const region = table.locator("..");
  const rail = app.locator(".expansion-scrollbar");
  await expect(app.locator(".expansion-scroll-marks")).toBeHidden();
  const before = await region.boundingBox();
  const text = await table.innerText();
  await region.evaluate(node => { node.scrollLeft = 500; });
  const left = await region.evaluate(node => node.scrollLeft);
  await rail.hover();
  const layout = await rail.evaluate(node => {
    const box = node.getBoundingClientRect();
    const region = node.parentElement!.querySelector<HTMLElement>(".initiative-list-container")!;
    const parent = region.getBoundingClientRect();
    const buttons = [...node.querySelectorAll("button")];
    const marks = buttons.map(button => button.getBoundingClientRect());
    const glyphs = buttons.map(button => { const range = document.createRange(); range.selectNodeContents(button.querySelector(".expansion-scroll-name")!); return range.getBoundingClientRect(); });
    return { glyphsInsideWidth: glyphs.every(glyph => glyph.left >= box.left && glyph.right <= box.right), inside: box.left >= parent.left + region.clientWidth - 1 && box.right <= parent.right + 1,
      labelsInside: marks.every(mark => mark.top >= box.top - 1 && mark.bottom <= box.bottom + 1 && mark.left >= box.left - 1 && mark.right <= box.right + 1),
      overlap: marks.some((mark, i) => marks.slice(i + 1).some(other => mark.top < other.bottom && other.top < mark.bottom)) };
  });
  expect(layout).toEqual({ glyphsInsideWidth: true, inside: true, labelsInside: true, overlap: false });
  const target = await table.evaluate(node => {
    const rows = [...node.querySelectorAll<HTMLElement>("tr[data-expansion-start]")];
    const row = rows.find(row => row.textContent?.includes("売上拡販"))!;
    const region = node.parentElement!;
    return { value: Math.min(region.scrollHeight - region.clientHeight,
      row.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop - node.querySelector("thead")!.getBoundingClientRect().height),
      point: (row.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop - node.querySelector("thead")!.getBoundingClientRect().height) /
        (region.scrollHeight - node.querySelector("thead")!.getBoundingClientRect().height) * region.clientHeight };
  });
  await rail.hover({ position: { x: 5, y: Math.max(1, Math.min(before!.height - 18, target.point)) } });
  await app.getByRole("button", { name: "売上拡販の先頭へ移動", exact: true }).click();
  await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollTop) - target.value)).toBeLessThan(2);
  expect(await region.evaluate(node => node.scrollLeft)).toBe(left);
  expect(await table.innerText()).toBe(text);
  expect(await region.boundingBox()).toEqual(before);
  await app.getByRole("heading", { name: "展開表", exact: true }).click();
  await expect(app.locator(".expansion-scroll-marks")).toBeHidden();
  await rail.hover();
  if (page.viewportSize()!.width > 600) await page.screenshot({ path: "/tmp/triadic-expansion-vertical-scrollbar.png" });
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "総原価表", exact: true }).click();
  await expect(app.locator(".expansion-scrollbar")).toHaveCount(0);
  const cost = app.getByRole("table", { name: "総原価表", exact: true }).locator("..");
  expect(await cost.evaluate(node => (node as HTMLElement).offsetWidth - node.clientWidth)).toBe(12);
});

test("縦バーの展開名からのドラッグとキーボード操作を維持する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await open(app);
  const region = app.getByRole("table", { name: "展開表", exact: true }).locator("..");
  const rail = app.locator(".expansion-scrollbar");
  await rail.hover();
  const label = rail.locator("button").first();
  const box = (await label.boundingBox())!;
  const geometry = await region.evaluate(node => ({ max: node.scrollHeight - node.clientHeight, height: node.clientHeight,
    thumb: Math.max(24, node.clientHeight * node.clientHeight / node.scrollHeight) }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollTop) - Math.min(geometry.max, 20 / (geometry.height - geometry.thumb) * geometry.max))).toBeLessThan(2);
  const slider = app.getByRole("scrollbar", { name: "展開表の縦スクロール", exact: true });
  await slider.press("End");
  await expect.poll(() => region.evaluate(node => Math.abs(node.scrollTop - (node.scrollHeight - node.clientHeight)))).toBeLessThan(2);
  await slider.press("Home");
  await expect.poll(() => region.evaluate(node => node.scrollTop)).toBe(0);
  await slider.press("Escape");
  await expect(app.locator(".expansion-scroll-marks")).toBeHidden();
});

test("大量行でも未描画の展開と施策のない展開へ移動できる", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=signed-categories-large");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await open(app);
  const table = app.getByRole("table", { name: "展開表", exact: true });
  await expect(table).toHaveClass(/virtual-table/);
  const region = table.locator("..");
  const rail = app.locator(".expansion-scrollbar");
  await rail.hover({ position: { x: 5, y: (await rail.boundingBox())!.height - 3 } });
  const last = rail.locator("button").last();
  const name = await last.locator(".expansion-scroll-name").textContent();
  await last.click();
  await expect.poll(() => region.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(table.locator(".expansion-group").filter({ hasText: name! }).last()).toBeVisible();
  const expected = await table.evaluate((node, name) => {
    const row = [...node.querySelectorAll<HTMLTableRowElement>("tr[data-expansion-start]")]
      .find(row => row.querySelector(".expansion-group")?.textContent === name)!;
    const region = node.parentElement!;
    return Math.min(region.scrollHeight - region.clientHeight, (Number(row.getAttribute("aria-rowindex")) - 7) * 28);
  }, name);
  await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollTop) - expected)).toBeLessThan(2);
});
