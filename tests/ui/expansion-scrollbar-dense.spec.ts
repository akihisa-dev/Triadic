import { test, expect, settleMotion } from "./fixtures";
import { layoutExpansionScrollMarks } from "../../Triadichrome-extension/src/extension/expansionScrollLayout";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

for (const virtual of [false, true]) test(`密集IDが伸びても押した展開の先頭へ移動する（仮想化${virtual}）`, async ({ page }) => {
  await page.goto(`/tests/ui/expansion-scrollbar-dense.html?virtual=${virtual}`);
  const table = page.getByRole("table", { name: "展開表", exact: true });
  await expect(table).toBeVisible();
  if (virtual) await expect(table).toHaveClass(/virtual-table/);
  const region = table.locator("..");
  const rail = page.locator(".expansion-scrollbar");
  await rail.hover();
  await settleMotion(rail);
  await expect(rail.locator('[data-expansion-id="1"]')).toHaveAttribute("data-dense", "false");
  const sales = rail.locator('[data-expansion-id="9"]');
  await expect(sales).toHaveAttribute("data-dense", "true");
  const collapsed = await sales.boundingBox();
  await sales.hover();
  await expect(sales).toHaveAttribute("aria-expanded", "true");
  await settleMotion(rail);
  expect((await sales.boundingBox())!.height).toBeGreaterThan(collapsed!.height);
  await expect(sales.locator(".expansion-scroll-name")).toHaveCSS("opacity", "1");
  const layout = await rail.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const boxes = [...node.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    return { inside: boxes.every(box => box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1),
      overlap: boxes.some((box, index) => boxes.slice(index + 1).some(other => box.top < other.bottom - .5 && other.top < box.bottom - .5)) };
  });
  expect(layout).toEqual({ inside: true, overlap: false });
  // The ID under the pointer must remain selected while the other IDs move.
  const shown = (await sales.boundingBox())!;
  await page.mouse.move(shown.x + shown.width / 2, shown.y + shown.height / 2);
  await page.mouse.down();
  await settleMotion(rail);
  await page.mouse.up();
  const firstIndex = virtual ? 80 + 1 + 7 * 2 : null;
  if (firstIndex !== null) {
    await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollTop) - firstIndex * 28)).toBeLessThan(2);
  } else {
    await expect.poll(() => table.evaluate(node => {
      const row = node.querySelector<HTMLElement>('tr[data-expansion-start="9"]')!;
      const region = node.parentElement!;
      return Math.abs(row.getBoundingClientRect().top - region.getBoundingClientRect().top - node.querySelector("thead")!.getBoundingClientRect().height);
    })).toBeLessThan(2);
  }
  // Repeated selections, including labels near the end, must not reuse the previous target.
  for (const id of [29, 3, 15]) {
    await rail.locator(`[data-expansion-id="${id}"]`).click();
    const index = (virtual ? 80 : 40) + 1 + (id - 2) * 2;
    if (virtual) await expect.poll(async () => Math.abs(await region.evaluate(node => node.scrollTop) - index * 28)).toBeLessThan(2);
    else await expect.poll(() => table.evaluate((node, id) => {
      const row = node.querySelector<HTMLElement>(`tr[data-expansion-start="${id}"]`)!;
      return Math.abs(row.getBoundingClientRect().top - node.parentElement!.getBoundingClientRect().top - node.querySelector("thead")!.getBoundingClientRect().height);
    }, id)).toBeLessThan(2);
  }
  await rail.hover();
  await settleMotion(rail);
  if (!virtual && page.viewportSize()!.width > 600) await page.screenshot({ path: "/tmp/triadichrome-dense-expansion-ids.png" });
});

test("小さいバーと長いIDでも拡大時に重ならず、選択対象を入れ替えない", () => {
  for (const height of [140, 280, 600]) {
    const marks = Array.from({ length: 30 }, (_, index) => ({ id: index === 15 ? 12345 : index + 1,
      name: `密集展開${index + 1}`, index, target: index * 28, point: height / 2 + index, nameSize: 72 }));
    const base = layoutExpansionScrollMarks(marks, height, height / 2, null);
    for (const mark of base) {
      const expanded = layoutExpansionScrollMarks(marks, height, height / 2, { id: mark.id, anchor: mark.position + mark.size / 2 });
      expect(expanded.map(mark => mark.id)).toEqual(base.map(mark => mark.id));
      const hovered = expanded.find(entry => entry.id === mark.id)!;
      const pointer = mark.position + mark.size / 2;
      expect(hovered.position).toBeLessThanOrEqual(pointer);
      expect(hovered.position + hovered.size).toBeGreaterThanOrEqual(pointer);
      for (let index = 0; index < expanded.length; index++) {
        const entry = expanded[index]!;
        expect(entry.position).toBeGreaterThanOrEqual(0);
        expect(entry.position + entry.size).toBeLessThanOrEqual(height + .01);
        if (index) expect(entry.position).toBeGreaterThanOrEqual(expanded[index - 1]!.position + expanded[index - 1]!.size);
      }
    }
  }
});

test("IDの拡大途中のクリックとキーボードでも同じ展開へ移動する", async ({ page }) => {
  await page.goto("/tests/ui/expansion-scrollbar-dense.html");
  const table = page.getByRole("table", { name: "展開表", exact: true });
  await expect(table).toBeVisible();
  const region = table.locator("..");
  const rail = page.locator(".expansion-scrollbar");
  await rail.hover();
  await settleMotion(rail);
  const button = rail.locator('[data-expansion-id="9"]');
  const initial = (await button.boundingBox())!;
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const difference = () => table.evaluate(node => {
    const row = node.querySelector<HTMLElement>('tr[data-expansion-start="9"]')!;
    return Math.abs(row.getBoundingClientRect().top - node.parentElement!.getBoundingClientRect().top - node.querySelector("thead")!.getBoundingClientRect().height);
  });
  await expect.poll(difference).toBeLessThan(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await region.evaluate(node => { node.scrollTop = 0; });
  await button.press("Enter");
  await expect.poll(difference).toBeLessThan(2);
  await expect(button).toHaveAttribute("aria-expanded", "true");
  expect(await button.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
});
