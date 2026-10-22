import { test, expect, type Page } from "@playwright/test";

async function edit(page: Page, text: string) {
  await page.getByRole("button", { name: "パーツ 1のテキストを編集", exact: true }).dblclick();
  const input = page.getByRole("textbox", { name: "パーツ 1の説明文", exact: true });
  await input.fill(text); await input.press("Escape");
}
const saved = async (page: Page) => JSON.parse(await page.getByLabel("SQLite保存内容", { exact: true }).innerText());

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/ui/detail-shared.html");
  await expect(page.getByRole("heading", { name: "共有更新の確認", exact: true })).toBeVisible();
});

test("明細の競合後も再試行と追加入力が元の更新番号を保持し、入力取消で最新を表示する", async ({ page }) => {
  await page.getByRole("button", { name: "次の保存を保留", exact: true }).click();
  await edit(page, "保持する自分の入力");
  await expect(page.getByRole("status")).toHaveText("保存を保留中");
  await page.getByRole("button", { name: "別画面で文章を変更", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(1);
  await page.getByRole("button", { name: "保存を完了", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("自動保存できませんでした");
  for (let count = 2; count <= 3; count++) {
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click();
    await expect(page.getByLabel("送信した更新番号", { exact: true })).toHaveText(JSON.stringify(Array(count).fill(0)));
    await expect(page.getByRole("alert")).toContainText("自動保存できませんでした");
    expect((await saved(page)).parts[1].text).toBe("別画面の保存済み文章");
  }
  await edit(page, "競合後の追加入力");
  await expect(page.getByLabel("送信した更新番号", { exact: true })).toHaveText("[0,0,0,0]");
  await expect(page.getByRole("alert")).toContainText("自動保存できませんでした");
  await expect(page.getByRole("button", { name: "パーツ 1のテキストを編集", exact: true })).toHaveText("競合後の追加入力");
  expect((await saved(page)).revision).toBe(1);
  await page.getByRole("button", { name: "入力を取り消す", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "パーツ 2のテキストを編集", exact: true })).toHaveText("別画面の保存済み文章");
  await edit(page, "最新の基準から保存");
  await expect.poll(async () => (await saved(page)).revision).toBe(2);
  expect((await saved(page)).parts[1].text).toBe("別画面の保存済み文章");
});

test("自分の保存中の追加入力は保存成功後の更新番号で続けて保存する", async ({ page }) => {
  await page.getByRole("button", { name: "次の保存を保留", exact: true }).click();
  await edit(page, "最初の入力");
  await expect(page.getByRole("status")).toHaveText("保存を保留中");
  await edit(page, "保存中の追加入力");
  await page.getByRole("button", { name: "保存を完了", exact: true }).click();
  await expect.poll(async () => (await saved(page)).parts[0].text).toBe("保存中の追加入力");
  await expect(page.getByLabel("送信した更新番号", { exact: true })).toHaveText("[0,1]");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
