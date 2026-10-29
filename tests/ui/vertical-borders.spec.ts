import { test, expect, settleMotion, openInitiativeEntry } from "./fixtures";
import type { Locator } from "@playwright/test";

// Check every real cell boundary, including blank amounts, totals and frozen columns.
// Period starts own the left edge; layout spacer rows deliberately own no edges.
async function expectVerticalBorders(table: Locator) {
  await expect(table).toBeVisible();
  const boundaries = await table.locator("tr:not(.virtual-row-spacer):not(.initiative-list-fill) > :is(th, td)").evaluateAll(cells => cells.map(cell => {
    const style = getComputedStyle(cell);
    const next = cell.nextElementSibling && getComputedStyle(cell.nextElementSibling);
    return { text: cell.textContent, edge: (style.borderRightStyle === "solid" && style.borderRightWidth === "1px") ||
      (next?.borderLeftStyle === "solid" && next.borderLeftWidth === "1px") };
  }));
  expect(boundaries.length).toBeGreaterThan(0);
  expect(boundaries.filter(cell => !cell.edge)).toEqual([]);
}

for (const dark of [false, true]) test(`全データ列の縦罫線を維持する（${dark ? "ダーク" : "ライト"}）`, async ({ page, app }) => {
  test.setTimeout(90_000);
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("switch", { name: "ダークテーマ" }).setChecked(dark);
  const nav = app.getByRole("navigation", { name: "メインナビゲーション" });
  for (const screen of ["総原価表", "施策一覧", "展開表", "前年入力"]) {
    await nav.getByRole("button", { name: screen, exact: true }).click();
    await expect(app.getByRole("heading", { name: screen, exact: true })).toBeVisible();
    await expectVerticalBorders(app.locator("table").first());
    if (screen === "総原価表") {
      await settleMotion(app.locator("body"));
      await page.screenshot({ path: `/tmp/triadic-vertical-borders-${dark ? "dark" : "light"}-${test.info().project.name}.png` });
      await app.locator(".cost-amount-button").first().press("Enter");
      await expectVerticalBorders(app.getByRole("table", { name: "金額の内訳", exact: true }));
      await app.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
    }
  }
  await openInitiativeEntry(app);
  await expectVerticalBorders(app.getByRole("table", { name: "月別金額", exact: true }));
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const menu = app.getByRole("complementary", { name: "メニュー" });
  for (const screen of ["勘定科目マスタ", "展開マスタ", "展開区分マスタ", "部署マスタ", "業種マスタ", "期間マスタ", "種別マスタ", "科目属性マスタ", "金額項目マスタ"]) {
    await menu.getByRole("button", { name: "マスタ", exact: true }).click();
    await app.getByRole("button", { name: new RegExp(`^${screen}`) }).click();
    await expect(app.getByRole("heading", { name: screen, exact: true })).toBeVisible();
    // The surrounding master list supplies its outer border.
    await expect(app.locator(".account-master-list")).toHaveCSS("border-right-width", "1px");
    if (["種別マスタ", "科目属性マスタ"].includes(screen)) continue; // One column: the surrounding frame supplies both edges.
    const cells = app.locator(".account-master-table tr > :is(th, td):not(:last-child)");
    await expect(cells.first()).toBeVisible();
    expect(await cells.count()).toBeGreaterThan(0);
    for (const width of await cells.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderRightWidth))) expect(width).toBe("1px");
  }
  await menu.getByRole("button", { name: "ダッシュボード", exact: true }).click();
  await expectVerticalBorders(app.locator(".analysis-heatmap table").first());
  await expect(app.locator(".analysis-values")).toHaveCount(0);
  await menu.getByRole("button", { name: "Home", exact: true }).click();
  await app.getByRole("button", { name: "画面とデータ", exact: true }).click();
  await expectVerticalBorders(app.locator(".screen-data-summary"));
  await app.locator(".screen-data-table-heading").first().click();
  await expectVerticalBorders(app.locator(".screen-data-columns table").first());
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await expectVerticalBorders(app.locator(".data-history-list table"));
  await app.getByRole("button", { name: /と現在の差分$/ }).last().click();
  const dialog = app.getByRole("dialog");
  await expectVerticalBorders(dialog.getByRole("table", { name: "履歴と現在の収支への影響", exact: true }));
  await dialog.getByRole("button", { name: "変更項目", exact: true }).click();
  await expectVerticalBorders(dialog.getByRole("table", { name: "履歴と現在の変更箇所", exact: true }));
  await settleMotion(app.locator("body"));
});
