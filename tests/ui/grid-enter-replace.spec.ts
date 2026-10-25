import { selectAccount, test, expect, settleMotion, selectClassification, openInitiativeEntry } from "./fixtures";
for (const surface of ["entry", "detail", "previous"]) for (const kind of [1, 2]) {
  test(`${surface}種別${kind}でEnter・Shift+Enter後の入力は値全体を置き換える`, async ({ page, app }) => {
    if (surface === "previous") await page.setViewportSize({ width: Math.max(600, page.viewportSize()!.width), height: 1400 });
    await page.goto("/tests/ui/preview.html");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    if (surface === "previous") {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "前年入力", exact: true }).click();
      await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
      await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
      await selectClassification(app.getByRole("spinbutton", { name: "前年", exact: true }), kind === 1 ? "前年見込" : "前年実績");
    } else {
      if (surface === "entry") {
        await openInitiativeEntry(app);
        await settleMotion(app.locator("body"));
        await app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }).focus();
        await selectAccount(app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }), "1");
        await app.getByRole("button", { name: "＋ 勘定科目を追加", exact: true }).click();
        await app.getByRole("combobox", { name: "2行目の勘定科目", exact: true }).focus();
        await selectAccount(app.getByRole("combobox", { name: "2行目の勘定科目", exact: true }), "1");
      } else {
        await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
        await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
      }
      await app.getByRole("tab", { name: kind === 1 ? "一次予算" : "確定予算", exact: true }).click();
    }
    await settleMotion(app.locator("body"));
    const table = app.getByRole("table", { name: surface === "previous" ? "前年入力の月別金額" : "月別金額", exact: true });
    const first = table.locator('input[data-row="0"][data-column="0"]');
    const next = table.locator('input[data-row="1"][data-column="0"]');
    await next.fill("30.456"); await next.press("Tab");
    await first.fill("10.125"); await first.press("Enter");
    await expect(next).toBeFocused();
    await next.pressSequentially("789");
    await expect(next).toHaveValue("789");
    await next.press("Shift+Enter");
    await expect(first).toBeFocused();
    await first.pressSequentially("2");
    await expect(first).toHaveValue("2");
    await first.press("Tab");
    await first.focus();
    await first.press("F2");
    if (surface === "previous") await first.fill("-");
    else { await first.press("ControlOrMeta+A"); await first.press("-"); }
    await first.press("Enter");
    await expect(first).toBeFocused();
    await first.press("Escape");
    await expect(first).toHaveValue("2");
    await first.press("9");
    await expect(first).toHaveValue("9");
    await first.press("Escape");
    await expect(first).toHaveValue("2");
    await first.press("F2");
    await first.press("End");
    await first.press("9");
    await expect(first).toHaveValue("29");
    await first.press("Escape");
    await expect(first).toHaveValue("2");
    await first.evaluate(node => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true })));
    await expect(first).toBeFocused();
  });
}
