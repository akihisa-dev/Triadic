import { test, expect, settleMotion } from "./fixtures";

for (const screen of ["施策一覧", "展開表"]) test(`${screen}の列見出し文字を列の中央に保ち、並べ替えと絞り込みを操作できる`, async ({ app, page }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: screen, exact: true }).click();
  await settleMotion(app.locator("body"));
  const table = app.getByRole("table", { name: screen, exact: true });
  const centred = async () => {
    const offsets = await table.locator("thead .table-view-sort").evaluateAll(buttons => buttons.map(button => {
      const range = document.createRange();
      range.selectNode(button.firstChild!);
      const text = range.getBoundingClientRect(), cell = button.closest("th")!.getBoundingClientRect();
      return Math.abs((text.left + text.right - cell.left - cell.right) / 2);
    }));
    expect(offsets.length).toBeGreaterThanOrEqual(40);
    for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1);
  };
  await centred();
  await table.getByRole("button", { name: "施策名", exact: true }).click();
  await expect(table.locator('[aria-sort="ascending"]')).toHaveCount(1);
  await centred();
  const trigger = table.getByRole("button", { name: "施策名を絞り込む", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const panel = app.getByRole("dialog", { name: "施策名", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole("searchbox").fill("倉庫");
  await panel.getByRole("button", { name: "適用", exact: true }).click();
  await expect(table.getByRole("button", { name: "施策名を絞り込む（適用中）", exact: true })).toBeVisible();
  await centred();
});

for (const screen of ["施策一覧", "総原価表"]) test(`${screen}の列見出しを縦罫線で区切る`, async ({ app, page }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: screen, exact: true }).click();
  await settleMotion(app.locator("body"));
  const table = app.getByRole("table", { name: screen, exact: true });
  const borders = await table.locator('thead th[scope="col"], thead th[scope="colgroup"]').evaluateAll(cells => cells.map(cell => {
    const style = getComputedStyle(cell), next = cell.nextElementSibling && getComputedStyle(cell.nextElementSibling);
    return { right: style.borderRightStyle === "solid" && parseFloat(style.borderRightWidth) === 1,
      nextLeft: next?.borderLeftStyle === "solid" && parseFloat(next.borderLeftWidth) === 1 };
  }));
  expect(borders.length).toBeGreaterThan(40);
  for (const border of borders) expect(border.right || border.nextLeft).toBe(true);
});

test("対象の表だけ見出し操作を持ち、総原価表と固定定義は行構造を保つ", async ({ app, page }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const menu = app.getByRole("complementary", { name: "メニュー" });
  for (const screen of ["施策一覧", "総原価表", "展開表"]) {
    await menu.getByRole("button", { name: screen, exact: true }).click();
    await expect(app.getByRole("heading", { name: screen, exact: true })).toBeVisible();
    if (screen === "総原価表") await expect(app.locator("thead .table-view-filter")).toHaveCount(0);
    else expect(await app.locator("thead .table-view-filter").count()).toBeGreaterThan(0);
    await expect(app.getByRole("button", { name: "クリア", exact: true })).toHaveCount(0);
    await expect(app.locator("thead [aria-sort]")).toHaveCount(0);
    if (screen === "総原価表") await expect(app.locator(".cost-amount-button").first()).toBeEnabled();
    if (screen === "施策一覧") await expect(app.locator('tbody tr:not([aria-hidden="true"])')).toHaveCount(14);
  }
  for (const screen of ["勘定科目マスタ", "展開マスタ", "業種マスタ", "部署マスタ", "期間マスタ"]) {
    await menu.getByRole("button", { name: "マスタ", exact: true }).click();
    await app.getByRole("button", { name: new RegExp(`^${screen}`) }).click();
    await expect(app.getByRole("heading", { name: screen, exact: true })).toBeVisible();
    expect(await app.locator("thead .table-view-filter").count()).toBeGreaterThan(0);
    await expect(app.getByRole("button", { name: "クリア", exact: true })).toHaveCount(0);
    await expect(app.locator("thead [aria-sort]")).toHaveCount(0);
    if (screen === "勘定科目マスタ") {
      await expect(app.getByRole("button", { name: "売上高を並べ替え", exact: true })).toBeEnabled();
    }
  }
  for (const screen of ["集計マスタ", "種別マスタ", "科目属性マスタ", "金額項目マスタ"]) {
    await menu.getByRole("button", { name: "マスタ", exact: true }).click();
    await app.getByRole("button", { name: new RegExp(`^${screen}`) }).click();
    await expect(app.getByRole("heading", { name: screen, exact: true })).toBeVisible();
    await expect(app.locator("thead .table-view-filter")).toHaveCount(0);
  }
});
