import { test, expect, selectClassification } from "./fixtures";

test("総原価表の月境界が見出しから金額行まで途切れず、比較対象を増やしても揃う", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "総原価表", exact: true }).click();
  const table = app.getByRole("table", { name: "総原価表", exact: true });
  for (const columns of [3, 5]) {
    if (columns === 5) await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
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
            return (index + 1) % columns === 0 && !cell.nextElementSibling?.classList.contains("period-start") ? css.borderRight === expected : css.borderRightWidth === "0px";
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
