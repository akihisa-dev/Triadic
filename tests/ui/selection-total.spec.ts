import { selectAccount, test, expect, openInitiativeEntry, settleMotion } from "./fixtures";

test("施策の選択合計は矩形・入力・取消・種別に追従する", async ({ page }) => {
  await page.goto("/tests/ui/budget-hints.html");
  const total = page.locator(".grid-selection-total");
  const april = page.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true });
  const may = page.getByRole("spinbutton", { name: "売上高 5月の金額", exact: true });
  await expect(total).toHaveText("");
  const before = await page.locator(".initiative-amount-table input").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  await april.click();
  await expect(total).toHaveText("選択範囲の合計0");
  await expect(page.locator('.grid-selection-description[role="status"]')).toContainText('1行目 売上高 4月から1行目 売上高 4月まで、1セルを選択');
  await april.press("Shift+ArrowRight");
  await expect(total).toHaveText("選択範囲の合計0.002");
  await expect(page.locator('.grid-selection-description[role="status"]')).toContainText('1行目 売上高 4月から1行目 売上高 5月まで、2セルを選択');
  const duplicate = page.locator('.initiative-amount-table input[data-column="0"]');
  await expect(duplicate.nth(1)).toHaveAttribute('aria-description','2行目');
  await expect(duplicate.nth(2)).toHaveAttribute('aria-description','3行目');
  expect(await duplicate.nth(1).getAttribute('aria-label')).toBe(await duplicate.nth(2).getAttribute('aria-label'));
  await may.press("Shift+ArrowDown");
  await expect(total).toHaveText("選択範囲の合計0.001");
  expect(await page.locator(".initiative-amount-table input").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(before);
  await may.fill("1.0001");
  await expect(total).toHaveText("計算できません");
  await expect(page.getByRole("alert")).toContainText("金額");
  await may.press("Escape");
  await expect(total).toHaveText("選択範囲の合計0.002");
  await page.getByRole("button", { name: "一次予算へ", exact: true }).click();
  await april.click();
  await april.press("Shift+ArrowRight");
  await expect(total).toHaveText("選択範囲の合計100.001");
  await may.press("Delete");
  await expect(total).toHaveText("選択範囲の合計0");
  await expect(april).toHaveValue("0");
  await expect(may).toHaveValue("0");
});

test("前年は科目のみを合計し、不正入力の訂正に追従する", async ({ page }) => {
  await page.goto("/tests/ui/previous-selection.html");
  const total = page.locator(".grid-selection-total");
  const april = page.locator('input[data-row="0"][data-column="0"]');
  const may = page.locator('input[data-row="0"][data-column="1"]');
  await april.click();
  await april.press("Shift+ArrowDown");
  await expect(total).toHaveText("選択範囲の合計（科目のみ）300");
  await expect(page.locator('.grid-selection-description[role="status"]')).toContainText(/4月まで、2セルを選択/);
  await april.fill("-0.001");
  await expect(total).toContainText("199.999");
  await april.fill("-");
  await expect(total).toContainText("不正な金額");
  await april.press("Escape");
  await expect(total).toHaveText("選択範囲の合計（科目のみ）100");
  await april.fill("9007199254740.991");
  await may.fill("0.001");
  await april.click();
  await april.press("Shift+ArrowRight");
  await expect(total).toContainText("上限");
  await may.fill("-0.001");
  await expect(total).toHaveText("選択範囲の合計（科目のみ）9007199254740.99");
});


for (const registered of [false, true]) {
  test(`${registered ? "登録済み" : "新規"}施策の合計エラー・訂正・Escで表領域と入力位置を保つ`, async ({ page, app }) => {
    await page.goto("/tests/ui/preview.html?data=full");
    await expect(page.getByRole("status")).toHaveText("操作できます");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
    if (registered) {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
      await app.getByRole("button", { name: "科目変更と削除の確認", exact: true }).click();
    } else {
      await openInitiativeEntry(app);
      const account = app.getByRole("combobox", { name: "1行目の勘定科目", exact: true });
      await account.focus();
      await selectAccount(account, { label: "売上高" });
    }
    const amount = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true });
    const total = app.locator(".grid-selection-total");
    const region = app.locator(".initiative-grid-scroll");
    await expect(total).toHaveText("");
    expect((await total.boundingBox())!.height).toBe(26);
    await amount.click();
    await settleMotion(app.locator("body"));
    const before = { cell: await amount.boundingBox(), region: await region.boundingBox() };
    expect((await total.boundingBox())!.height).toBe(26);
    const stable = async () => {
      await settleMotion(app.locator("body"));
      expect(await amount.boundingBox()).toEqual(before.cell);
      expect(await region.boundingBox()).toEqual(before.region);
      expect((await total.boundingBox())!.height).toBe(26);
    };
    await amount.fill("0.0001");
    await expect(total).toHaveText("計算できません");
    await expect(app.getByRole("alert").filter({ hasText: "小数点以下3桁" }).first()).toBeVisible();
    await stable();
    await amount.press("Escape");
    await expect(amount).toHaveValue("0");
    await expect(total).toHaveText("選択範囲の合計0");
    await stable();
    await amount.fill("0.0001");
    await expect(total).toHaveText("計算できません");
    await stable();
    await amount.fill("0");
    await expect(total).toHaveText("選択範囲の合計0");
    await expect(app.getByRole("alert")).toHaveCount(0);
    await stable();
  });
}

test("選択合計だけが上限を超えた理由も固定通知へ表示する", async ({ page }) => {
  await page.goto("/tests/ui/budget-hints.html");
  await page.getByRole("button", { name: "一次予算へ", exact: true }).click();
  const april = page.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true });
  const may = page.getByRole("spinbutton", { name: "売上高 5月の金額", exact: true });
  const total = page.locator(".grid-selection-total");
  await april.fill("9007199254740.991");
  await may.fill("0.001");
  await april.click();
  await expect(total.locator("strong")).toHaveText("9007199254740.991");
  expect((await total.boundingBox())!.height).toBe(26);
  await april.press("Shift+ArrowRight");
  await expect(total).toHaveText("計算できません");
  await expect(page.getByRole("alert")).toHaveText("選択範囲の合計が計算できる上限を超えています。");
  expect((await total.boundingBox())!.height).toBe(26);
  await may.fill("-0.001");
  await expect(total).toHaveText("選択範囲の合計9007199254740.99");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
