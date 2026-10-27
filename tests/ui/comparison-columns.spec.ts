import { test, expect, selectBudgets, settleMotion } from "./fixtures";

for (const screen of ["総原価表", "展開表"]) test(`${screen}は選んだ前年と両予算を省略せず、一行の名称で表示する`, async ({ page, app }, info) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: screen, exact: true }).click();
  const table = app.getByRole("table", { name: screen, exact: true });
  const headers = table.locator("thead tr:nth-child(2) th");
  for (const [first, final] of [[1, 1], [2, 2], [1, 2], [2, 1]]) {
    await selectBudgets(app, [1, 2]);
    for (const [kind, previous] of [["一次予算", first], ["確定予算", final]]) {
      const checkbox = app.getByRole("checkbox", { name: `前年${previous === 1 ? "見込" : "実績"}を基準にした${kind}`, exact: true });
      if (!await checkbox.isChecked()) await checkbox.click();
      await expect(checkbox).toBeChecked();
    }
    const priors = first === final ? [first === 1 ? "前年見込" : "前年実績"] : ["前年見込", "前年実績"];
    const expected = [...priors, "一次予算", "確定予算", "差額"];
    await expect(headers).toHaveCount(expected.length * 19);
    await expect(headers).toHaveText(Array(19).fill(expected).flat());
    const lines = await headers.evaluateAll(nodes => nodes.map(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return { text: node.textContent, lines: range.getClientRects().length };
    }));
    expect(lines.every(header => header.lines === 1 && !header.text?.includes("基準"))).toBe(true);
    // Added prior columns keep their vertical edges, including empty cells in initiative rows.
    const borders = await table.locator('tr:not(.virtual-row-spacer) > td').evaluateAll(nodes => nodes.map(node => {
      const css = getComputedStyle(node), next = node.nextElementSibling && getComputedStyle(node.nextElementSibling);
      return css.borderRightWidth === "1px" || next?.borderLeftWidth === "1px";
    }));
    expect(borders.every(Boolean)).toBe(true);
  }
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadic-${screen}-selected-columns-${info.project.name}.png` });
  if (screen === "総原価表") {
    const row = table.getByRole("row").filter({ has: app.getByRole("rowheader", { name: "売上高", exact: true }) });
    for (const label of ["前年見込", "前年実績", "一次予算", "確定予算", "差額"]) {
      const button = row.getByRole("button", { name: `売上高 4月 ${label}の内訳`, exact: true });
      const amount = await button.innerText();
      await button.press("Enter");
      const dialog = app.getByRole("dialog");
      await expect(dialog.getByRole("row").last().getByRole("cell")).toHaveText(amount);
      await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    }
  }
});
