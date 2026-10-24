import { test, expect, settleMotion } from "./fixtures";

test("初回ライト・キーボード切替・記憶・画面移動・表・ダイアログ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await expect(app.locator("html")).toHaveAttribute("data-theme", "light");
  const toggle = app.getByRole("switch", { name: "ダークテーマ" });
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toBeChecked();
  await expect(app.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(app.locator(".entry-page")).toHaveCSS("background-color", "rgb(24, 24, 24)");
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await expect(toggle).toBeChecked();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(app.locator(".home-header").getByRole("switch")).toBeChecked();
  const navigation = app.getByRole("navigation", { name: "メインナビゲーション" });
  for (const name of ["施策一覧", "総原価表", "展開表", "前年入力", "マスタ", "履歴", "入出力", "Home"]) {
    await navigation.getByRole("button", { name, exact: true }).click();
    await expect(app.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(toggle).toBeChecked();
    if (name === "総原価表") {
      await expect(app.locator(".cost-table tbody tr").first()).toBeVisible();
      await expect(app.locator(".cost-table .period-quarter").first()).toHaveCSS("background-color", "rgb(44, 44, 44)");
    }
    await settleMotion(app.locator("body"));
    // No horizontal overflow from the new header control, even on narrow screens.
    expect(await app.locator("body").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await navigation.getByRole("button", { name: "マスタ", exact: true }).click();
  await app.getByRole("button", { name: /^勘定科目マスタ/ }).click();
  await expect(app.getByRole("heading", { name: "勘定科目マスタ", exact: true })).toBeVisible();
  await expect(app.locator(".master-data-page input").first()).toHaveCSS("background-color", "rgb(26, 26, 26)");
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await expect(app.getByRole("dialog")).toHaveCSS("background-color", "rgb(32, 32, 32)");
  await app.getByRole("dialog").press("Escape");
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(app.locator("html")).toHaveCSS("color-scheme", "light");
});

test("記憶が不正・利用不可でも起動と切替ができる", async ({ page, app }) => {
  await page.addInitScript(() => {
    localStorage.setItem("triadichrome.theme", "invalid");
    Storage.prototype.setItem = () => { throw new DOMException("保存不可", "QuotaExceededError"); };
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("操作できます");
  const toggle = app.getByRole("switch", { name: "ダークテーマ" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(toggle).toBeChecked();
});

test("テーマ設定を読めなくてもライトで開始し切替できる", async ({ page, app }) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "triadichrome.theme") throw new DOMException("利用不可", "SecurityError");
      return getItem.call(this, key);
    };
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("操作できます");
  const toggle = app.getByRole("switch", { name: "ダークテーマ" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
});

test("各画面幅でヘッダーのトグルへ到達できる", async ({ page, app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  for (const width of [320, 600, 700, 800, 900, 1280, 1920, 3824]) {
    await page.setViewportSize({ width, height: 864 });
    await settleMotion(app.locator("body"));
    const bounds = await app.getByRole("switch", { name: "ダークテーマ" }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const fileName = (await app.locator(".home-file-name").boundingBox())!;
    expect(fileName.width).toBeGreaterThan(0);
    expect(bounds!.x - (fileName.x + fileName.width)).toBeCloseTo(12, 0);
    expect(fileName.y + fileName.height / 2).toBeCloseTo(bounds!.y + bounds!.height / 2, 0);
    const header = (await app.locator(".home-header").boundingBox())!;
    expect(header.x + header.width - bounds!.x - bounds!.width).toBeCloseTo(width <= 600 ? 12 : 16, 0);
    await app.getByRole("switch", { name: "ダークテーマ" }).click();
  }
});
