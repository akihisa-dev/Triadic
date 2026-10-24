import { test, expect, settleMotion, selectClassification } from "./fixtures";
for (const surface of ["initiative", "previous"]) {
  test(`${surface}の月見出しは選択範囲に追従し寸法を維持する`, async ({ page, app }) => {
    if (surface === "previous") await page.setViewportSize({ width: Math.max(600, page.viewportSize()!.width), height: 1400 });
    await page.goto("/tests/ui/preview.html");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    if (surface === "initiative") {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
      await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
    } else {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "前年入力", exact: true }).click();
      await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
      await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
    }
    const table = app.getByRole("table", { name: surface === "initiative" ? "月別計画金額" : "前年入力の月別金額", exact: true });
    await settleMotion(app.locator("body"));
    const cell = table.locator('input[data-row="0"][data-column="0"]');
    const before = await cell.boundingBox();
    await cell.click();
    await expect(table.locator(".grid-month-selected")).toHaveText(["4月"]);
    await cell.press("Shift+ArrowRight");
    await expect(table.locator(".grid-month-selected")).toHaveText(["4月", "5月"]);
    await table.locator('input[data-row="0"][data-column="1"]').press("Shift+ArrowRight");
    await expect(table.locator(".grid-month-selected")).toHaveText(["4月", "5月", "6月"]);
    expect((await cell.boundingBox())!.width).toBe(before!.width);
    expect((await cell.boundingBox())!.height).toBe(before!.height);
    if (surface === "initiative") await app.getByRole("tab", { name: "一次予算", exact: true }).click();
    else await selectClassification(app.getByRole("spinbutton", { name: "前年", exact: true }), "前年実績");
    await expect(table.locator(".grid-month-selected")).toHaveCount(0);
  });
}
