import { test, expect, selectBudgets, settleMotion } from "./fixtures";

for (const screen of ["総原価表", "展開表"]) test(`${screen}の前年・一次・確定は独立して選択・表示・保存される`, async ({ page, app }, info) => {
  test.setTimeout(60_000);
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const nav = app.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("button", { name: screen, exact: true }).click();
  const table = app.getByRole("table", { name: screen, exact: true });
  const headers = table.locator("thead tr:nth-child(2) th");
  const group = app.getByRole("group", { name: "予算の比較条件", exact: true });
  await expect(group.getByRole("checkbox")).toHaveCount(6);
  const states = () => group.getByRole("checkbox").evaluateAll(nodes => nodes.map(node => ({ name: node.getAttribute("aria-label"), checked: (node as HTMLInputElement).checked })));
  const select = async (name: string) => { const box = group.getByRole("checkbox", { name, exact: true }); if (!await box.isChecked()) await box.click(); await expect(box).toBeChecked(); };
  const budgetAmounts = async (only?: string) => {
    const count = (await states()).filter(box => box.name?.includes("基準") && box.checked).length;
    const metrics = screen === "総原価表" ? 1 : 2;
    const span = (await headers.count()) / 19 * metrics;
    return table.locator(`[data-copy-row="${screen === "総原価表" ? 0 : 1}"]`).evaluateAll((nodes, { count, metrics, span, only }) => nodes.filter(node => {
      const position = Number((node as HTMLElement).dataset.copyColumn) % span;
      return only ? Math.floor(position / metrics) === (only === "一次予算" ? 1 : 2) : position >= metrics && position < metrics * (1 + count);
    }).map(node => node.textContent), { count, metrics, span, only });
  };
  for (const display of [1, 2]) for (const [first, final] of [[1, 1], [2, 2], [1, 2], [2, 1]]) {
    const before = await states();
    const amountsBefore = await budgetAmounts();
    await select(`前年列に前年${display === 1 ? "見込" : "実績"}を表示`);
    const afterDisplay = await states();
    expect(await budgetAmounts()).toEqual(amountsBefore);
    expect(afterDisplay.filter(box => box.name?.includes("基準"))).toEqual(before.filter(box => box.name?.includes("基準")));
    await selectBudgets(app, [1, 2]);
    for (const [kind, previous, other] of [["一次予算", first, "確定予算"], ["確定予算", final, "一次予算"]] as const) {
      const beforeBudget = await states();
      const otherAmounts = await budgetAmounts(other);
      await select(`前年${previous === 1 ? "見込" : "実績"}を基準にした${kind}`);
      const afterBudget = await states();
      expect(await budgetAmounts(other)).toEqual(otherAmounts);
      expect(afterBudget.filter(box => box.name?.includes("前年列") || box.name?.includes(other))).toEqual(beforeBudget.filter(box => box.name?.includes("前年列") || box.name?.includes(other)));
    }
    const expected = [display === 1 ? "前年見込" : "前年実績", "一次予算", "確定予算", "差額"];
    await expect(headers).toHaveText(Array(19).fill(expected).flat());
    expect(await headers.evaluateAll(nodes => nodes.every(node => { const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects().length === 1; }))).toBe(true);
  }
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadic-${screen}-independent-${info.project.name}.png` });
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await nav.getByRole("button", { name: screen, exact: true }).click();
  await expect(group.getByRole("checkbox", { name: "前年列に前年実績を表示", exact: true })).toBeChecked();
  await select("前年列に前年見込を表示");
  await app.getByRole("button", { name: "操作を取り消す", exact: true }).click();
  await expect(group.getByRole("checkbox", { name: "前年列に前年実績を表示", exact: true })).toBeChecked();
  await app.getByRole("button", { name: "操作をやり直す", exact: true }).click();
  await expect(group.getByRole("checkbox", { name: "前年列に前年見込を表示", exact: true })).toBeChecked();
});

test("前年列の保存失敗でも3列の選択と表示を保持する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?scenario=save-failure");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "総原価表", exact: true }).click();
  await app.getByRole("checkbox", { name: "前年列に前年実績を表示", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("保存失敗");
  await expect(app.getByRole("checkbox", { name: "前年列に前年見込を表示", exact: true })).toBeChecked();
  await expect(app.getByRole("checkbox", { name: "前年見込を基準にした一次予算", exact: true })).toBeChecked();
  await expect(app.getByRole("table", { name: "総原価表", exact: true }).getByRole("columnheader", { name: "前年見込", exact: true })).toHaveCount(19);
});
