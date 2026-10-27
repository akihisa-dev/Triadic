import { selectBudgets } from "./fixtures";
import { test, expect } from "./fixtures";

test("総原価表の月境界が見出しから金額行まで途切れず、比較対象を増やしても揃う", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "総原価表", exact: true }).click();
  const table = app.getByRole("table", { name: "総原価表", exact: true });
  for (const both of [false, true]) {
    const columns = both ? 4 : 3;
    if (both) await selectBudgets(app, [1, 2]);
    const borders = await table.evaluate((node, columns) => {
      const monthHeaders = [...node.querySelectorAll("thead tr:first-child th.period-month")];
      const rows = [...node.querySelectorAll("tr")].slice(1);
      const expected = getComputedStyle(monthHeaders[0]!).borderRight;
      return {
        months: monthHeaders.length,
        visible: getComputedStyle(monthHeaders[0]!).borderRightWidth === "1px",
        rows: rows.length,
        aligned: rows.every(row => {
          const cells = [...row.querySelectorAll(".period-month")];
          return cells.length === 12 * columns && cells.every((cell, index) => {
            const css = getComputedStyle(cell);
            const periodBoundary = cell.nextElementSibling?.classList.contains("period-start");
            if ((index + 1) % columns === 0 && !periodBoundary) return css.borderRight === expected;
            return css.borderRightWidth === (periodBoundary ? "0px" : "1px");
          });
        }),
      };
    }, columns);
    expect(borders.months).toBe(12);
    expect(borders.visible).toBe(true);
    expect(borders.rows).toBeGreaterThan(2);
    expect(borders.aligned).toBe(true);
  }
});
