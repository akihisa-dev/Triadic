import { test, expect, selectClassification } from "./fixtures";

test("総原価表と展開表の期間計を比較対象の切替後も確認できる", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  const labels = ["第1四半期計", "第2四半期計", "上期計", "第3四半期計", "第4四半期計", "下期計", "年間計"];
  for (const name of ["総原価表", "展開表"]) {
    await menu.getByRole("button", { name, exact: true }).click();
    const table = app.getByRole("table", { name, exact: true });
    for (const label of labels) await expect(table.getByRole("columnheader", { name: label, exact: true })).toHaveCount(1);
    // Verify the visible distinction throughout headers, ordinary rows and subtotal rows.
    const bands = await table.evaluate(node => {
      const style = (element: Element) => {
        const css = getComputedStyle(element);
        return { background: css.backgroundColor, weight: Number(css.fontWeight), border: css.borderLeftWidth };
      };
      return ["quarter", "half", "annual"].map(kind => {
        const cells = [...node.querySelectorAll(`.period-${kind}`)];
        return { kind, header: style(node.querySelector(`thead th.period-${kind}`)!),
          amount: style(node.querySelector(`td.period-${kind}`)!),
          uniform: new Set(cells.map(cell => style(cell).background)).size === 1,
          boundaries: [...node.querySelectorAll(`.period-${kind}.period-start`)].every(cell => style(cell).border === "2px") };
      });
    });
    expect(bands.every(band => band.uniform && band.boundaries)).toBe(true);
    expect(new Set(bands.map(band => band.amount.background)).size).toBe(3);
    expect(bands[1]!.amount.weight).toBeGreaterThanOrEqual(600);
    expect(bands[2]!.amount.weight).toBeGreaterThan(bands[1]!.amount.weight);
    const region = table.locator("..");
    await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    await expect(table.getByRole("columnheader", { name: "年間計", exact: true })).toBeVisible();
    if (name === "展開表") {
      const row = table.getByRole("row").filter({ has: app.getByRole("button", { name: "確定予算の下期調整", exact: true }) });
      const annualHeaders = table.locator("thead tr:nth-child(2) th.period-annual");
      const annualAmounts = row.locator("td.period-annual");
      await expect(annualHeaders).toHaveText(["一次予算"]);
      await expect(annualAmounts).toHaveText(["1,200", "1,200"]);
      await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
      await expect(annualHeaders).toHaveText(["一次予算", "確定予算", "比較"]);
      await expect(annualAmounts).toHaveText(["1,200", "1,200", "1,250", "1,250", "50", "50"]);
      // A category cell appears only on the first row of a merged category group.
      // Move the same initiative to an unused category to cover that extra cell too.
      await row.getByRole("button", { name: "確定予算の下期調整", exact: true }).click();
      await app.getByRole("combobox", { name: "展開名", exact: true }).selectOption({ label: "コスト" });
      await app.getByRole("combobox", { name: "展開区分", exact: true }).selectOption({ label: "下払いUP" });
      await expect(menu.getByRole("button", { name: "展開表", exact: true })).toBeEnabled();
      await menu.getByRole("button", { name: "展開表", exact: true }).click();
      await expect(row.locator("td.expansion-category")).toHaveText("下払いUP");
      await expect(annualAmounts).toHaveText(["1,200", "1,200", "1,250", "1,250", "50", "50"]);
    }
  }
});
