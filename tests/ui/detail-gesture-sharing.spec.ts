import { test, expect, type Page } from "@playwright/test";

const saved = async (page: Page) => JSON.parse(await page.getByLabel("SQLite保存内容", { exact: true }).innerText());
async function external(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(async () => (await saved(page)).revision).toBe(1);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/tests/ui/detail-operations.html");
  await expect(page.getByRole("heading", { name: "操作競合の確認", exact: true })).toBeVisible();
});
for (const operation of ["move", "resize", "pool", "cancel", "layout"] as const) {
  test(`パーツ操作 ${operation} は途中の共有内容を保護する`, async ({ page }) => {
    const target = operation === "pool" ? page.locator('.detail-pool-source').first()
      : operation === "resize" ? page.getByRole("button", { name: "パーツ 1の右下でサイズ変更", exact: true })
        : page.getByRole("group", { name: "パーツ 1", exact: true });
    const box = (await target.boundingBox())!;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    const canvas = (await page.getByRole("region", { name: "パーツの編集領域" }).boundingBox())!;
    await page.mouse.move(operation === "pool" ? canvas.x + 90 : start.x + 48,
      operation === "pool" ? canvas.y + 170 : start.y + 24, { steps: 4 });
    await expect(page.locator('.detail-part.is-dragging')).toHaveCount(1);
    await external(page, operation === "layout" ? "共有配置を更新" : "共有内容を更新");
    if (operation === "cancel") await page.keyboard.press("Escape");
    await page.mouse.up();
    if (operation === "layout" || operation === "cancel") {
      await expect(page.locator('.detail-part.is-dragging')).toHaveCount(0);
      expect((await saved(page)).revision).toBe(1);
      expect((await saved(page)).parts[0].x).toBe(operation === "layout" ? 24 : 0);
    } else {
      await expect.poll(async () => (await saved(page)).revision).toBe(2);
      const result = await saved(page);
      expect(result.parts.length).toBe(operation === "pool" ? 5 : 4);
      if (operation === "move") expect(result.parts[0].x).toBeGreaterThan(0);
      if (operation === "resize") expect(result.parts[0].width).toBeGreaterThan(168);
    }
    if (operation !== "layout") {
      const result = await saved(page);
      expect(result.parts[0].text).toBe("共有更新a"); expect(result.parts[1].text).toBe("共有更新b");
      expect(result.parts[2].name).toBe("共有画像.png"); expect(result.parts[3].cells[0][0]).toBe("共有表A");
    }
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
