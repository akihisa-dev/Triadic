import { test, expect, type Page } from "@playwright/test";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
async function release(page: Page, index = 0) {
  await page.evaluate(index => { (window as unknown as { decodes: (() => void)[] }).decodes[index]!(); }, index);
}
async function select(page: Page, name: string) {
  await page.getByLabel("パーツ 1の画像ファイル", { exact: true }).setInputFiles({ name, mimeType: "image/png", buffer: png });
}
const saved = async (page: Page) => JSON.parse(await page.getByLabel("SQLite保存内容", { exact: true }).innerText());
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = Image.prototype.decode;
    const decodes: (() => void)[] = [];
    Object.assign(window, { decodes });
    Image.prototype.decode = function () { return new Promise<void>((resolve, reject) => decodes.push(() => { original.call(this).then(resolve, reject); })); };
  });
  await page.goto("/tests/ui/detail-image-pending.html");
  await expect(page.getByRole("heading", { name: "画像読込の確認" })).toBeVisible();
});
for (const action of ["別名保存", "保存取消", "操作取消", "画面移動", "履歴移動"]) {
  test(`画像読込が確定してから${action}する`, async ({ page }) => {
    await select(page, "選択した画像.png");
    await expect.poll(() => page.evaluate(() => (window as unknown as { decodes: unknown[] }).decodes.length)).toBe(1);
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("待機中");
    await expect(page.getByLabel("操作時の保存内容", { exact: true })).toBeEmpty();
    await release(page);
    await expect(page.getByRole("status")).toHaveText(`${action}完了`);
    const captured = JSON.parse(await page.getByLabel("操作時の保存内容", { exact: true }).innerText());
    expect(captured.parts[0].name).toBe("選択した画像.png"); expect(captured.parts[0].src).toMatch(/^data:image\/png;base64,/);
    expect((await saved(page)).parts[0].name).toBe(action === "操作取消" ? "" : "選択した画像.png");
  });
}
test("再選択と削除では古い画像読込が復活しない", async ({ page }) => {
  await select(page, "古い画像.png"); await select(page, "新しい画像.png");
  await expect.poll(() => page.evaluate(() => (window as unknown as { decodes: unknown[] }).decodes.length)).toBe(2);
  await release(page, 1);
  await expect.poll(async () => (await saved(page)).parts[0].name).toBe("新しい画像.png");
  await release(page, 0);
  await page.getByRole("button", { name: "保存取消", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("保存取消完了");
  expect((await saved(page)).parts[0].name).toBe("新しい画像.png");
  await select(page, "削除後に終わる画像.png");
  await expect.poll(() => page.evaluate(() => (window as unknown as { decodes: unknown[] }).decodes.length)).toBe(3);
  await page.getByRole("button", { name: "パーツ 1を削除", exact: true }).press("Enter");
  await release(page, 2);
  await expect.poll(async () => (await saved(page)).parts.length).toBe(0);
});
