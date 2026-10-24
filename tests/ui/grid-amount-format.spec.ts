import { test, expect, settleMotion, selectClassification, openInitiativeEntry } from "./fixtures";
for (const surface of ["entry", "detail", "previous"]) {
  test(`${surface}の金額は表示だけ桁区切りし編集中の小数精度と取消を保持する`, async ({ page, app }) => {
    if (surface === "previous") await page.setViewportSize({ width: Math.max(600, page.viewportSize()!.width), height: 1400 });
    await page.goto("/tests/ui/preview.html");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    if (surface === "previous") {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "前年入力", exact: true }).click();
      await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
      await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
    } else if (surface === "entry") {
      await openInitiativeEntry(app);
      await settleMotion(app.locator("body"));
      await app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }).focus();
      await app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }).selectOption("1");
    } else {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
      await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
    }
    await settleMotion(app.locator("body"));
    const table = app.getByRole("table", { name: surface === "previous" ? "前年入力の月別金額" : "月別計画金額", exact: true });
    const cell = table.locator('input[data-row="0"][data-column="0"]');
    const display = cell.locator("..").locator(".grid-amount-display");
    for (const value of ["1234.567", "-1234.567", "0", "0.001", "1234567.001"]) {
      await cell.fill(value);
      await expect(display).toHaveCount(0);
      await cell.press("Tab");
      await expect(cell).toHaveValue(value);
      await expect(display).toHaveText(Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 }));
      await cell.focus();
      await expect(display).toBeVisible();
      await cell.press("F2");
      await expect(display).toHaveCount(0);
      await expect(cell).toHaveValue(value);
      await cell.fill("9876.543");
      await cell.press("Escape");
      await expect(cell).toHaveValue(value);
      await expect(display).toHaveText(Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 }));
    }
    await cell.dblclick();
    await expect(display).toHaveCount(0);
    await cell.press("Escape");
    await expect(display).toHaveText("1,234,567.001");
    const copied = await cell.evaluate(node => {
      const clipboardData = new DataTransfer();
      node.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, clipboardData }));
      return clipboardData.getData("text/plain");
    });
    expect(copied).toBe("1234567.001");
  });
}
