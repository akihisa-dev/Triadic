import { selectAccount, openInitiativeEntry, test, expect, selectClassification, settleMotion } from "./fixtures";
import type { Locator } from "@playwright/test";

async function paste(cell: Locator, text: string) {
  await cell.evaluate((node, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", value);
    node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData }));
  }, text);
}

test.beforeEach(async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=defaults");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await openInitiativeEntry(app);
  for (const name of ["一次予算", "確定予算"]) {
    await app.getByRole("tab", { name, exact: true }).click();
    await expect(app.getByRole("button", { name: /^(一次予算を反映する|年間金額を配分|実施月をまとめて移動)$/ })).toHaveCount(0);
  }
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await app.getByRole("heading", { name: "施策入力", exact: true }).click();
  await settleMotion(app.locator("body"));
  await app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }).focus();
  await selectAccount(app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }), "1");
  await app.getByRole("button", { name: "＋ 勘定科目を追加", exact: true }).click();
  await app.getByRole("combobox", { name: "2行目の勘定科目", exact: true }).focus();
  await selectAccount(app.getByRole("combobox", { name: "2行目の勘定科目", exact: true }), "1");
});

test("複数行・月の貼り付け、範囲コピー・同値入力・消去と引き継ぎ", async ({ page, app }, testInfo) => {
  const cell = (row: number, month: number) => app.getByRole("spinbutton", { name: `売上高 ${month}月の金額`, exact: true }).nth(row);
  const april = cell(0, 4);
  await april.click();
  await paste(april, "1,200.125\t-0.001\r\n25\t0\r\n");
  await expect(april).toHaveValue("1200.125");
  await expect(cell(0, 5)).toHaveValue("-0.001");
  await expect(cell(1, 4)).toHaveValue("25");
  await april.press("Shift+ArrowRight");
  await cell(0, 5).press("Shift+ArrowDown");
  await expect(app.locator(".initiative-cell-selected")).toHaveCount(4);
  const copied = await cell(1, 5).evaluate(node => {
    const clipboardData = new DataTransfer();
    node.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, clipboardData }));
    return clipboardData.getData("text/plain");
  });
  expect(copied).toBe("1200.125\t-0.001\n25\t0");
  await cell(1, 5).press("2");
  await cell(1, 5).press("ControlOrMeta+Enter");
  await cell(1, 5).press("3");
  await expect(cell(1, 5)).toHaveValue("3");
  await cell(1, 5).fill("3.125");
  await cell(1, 5).press("ControlOrMeta+Enter");
  for (const row of [0, 1]) for (const month of [4, 5]) await expect(cell(row, month)).toHaveValue("3.125");
  await cell(1, 5).press("Delete");
  for (const row of [0, 1]) for (const month of [4, 5]) await expect(cell(row, month)).toHaveValue("0");
  for (const [text, value] of [["7.001\n", "7.001"], ["9.001\r\n", "9.001"], ["8.001", "8.001"]]) {
    await paste(cell(1, 5), text!);
    for (const row of [0, 1]) for (const month of [4, 5]) await expect(cell(row, month)).toHaveValue(value!);
  }
  for (const row of [0, 1]) for (const month of [4, 5]) await expect(cell(row, month)).toHaveValue("8.001");
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(april).toHaveValue("8.001");
  await april.click(); await april.press("Shift+ArrowRight");
  await cell(0, 5).press("Shift+ArrowDown");
  await paste(cell(1, 5), "0");
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(april).toHaveValue("8.001");
  await april.fill("10");
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(april).toHaveValue("0");
  await expect(app.getByText("引き継ぎ", { exact: true })).toHaveCount(0);
  await expect(app.getByText(/前年差・単位/)).toHaveCount(0);
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: testInfo.outputPath("initiative-grid.png") });
});

test("不正・表外・科目未選択の保護とセル移動", async ({ app }) => {
  const cell = (row: number, month: number) => app.getByRole("spinbutton", { name: `売上高 ${month}月の金額`, exact: true }).nth(row);
  const april = cell(0, 4);
  await april.click(); await paste(april, "7\t8\n9\t10");
  for (const text of ["1\t2\n3\t不正", "0.0001", "1\t2\n3", "=1+"]) {
    await paste(april, text);
    await expect(app.getByRole("alert")).toBeVisible();
    await expect(april).toHaveValue("7");
    await expect(cell(1, 5)).toHaveValue("10");
  }
  await cell(0, 3).click(); await paste(cell(0, 3), "1\t2");
  await expect(app.getByRole("alert")).toContainText("外");
  await expect(cell(0, 3)).toHaveValue("0");
  await app.getByRole("button", { name: "通知を閉じる", exact: true }).click();
  await app.getByRole("button", { name: "＋ 勘定科目を追加", exact: true }).click();
  await cell(1, 4).click(); await paste(cell(1, 4), "1\n2");
  await expect(app.getByRole("alert")).toContainText("勘定科目");
  await expect(cell(1, 4)).toHaveValue("9");
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(april).toBeEnabled();
  await cell(0, 10).click();
  await cell(0, 10).press("Escape");
  await paste(cell(0, 10), "15\t-0.001");
  await expect(cell(0, 10)).toHaveValue("15");
  await expect(cell(0, 11)).toHaveValue("-0.001");
  await expect(april).toHaveValue("7");
  await cell(0, 10).press("Tab");
  await expect(cell(0, 11)).toBeFocused();
  await cell(0, 11).press("Shift+Tab");
  await expect(cell(0, 10)).toBeFocused();
  await cell(0, 10).press("Enter");
  await expect(cell(1, 10)).toBeFocused();
  await cell(1, 10).press("F2"); await cell(1, 10).fill("99"); await cell(1, 10).press("Escape");
  await expect(cell(1, 10)).toHaveValue("0");
});

test("ドラッグで矩形を選択して保存し、開き直しても維持する", async ({ page, app }, testInfo) => {
  if (testInfo.project.name === "narrow") await page.setViewportSize({ width: 1280, height: 864 });
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("範囲入力の保存確認");
  for (const [name, value] of [["展開名", "コスト"], ["部署名", "部署A"], ["業種名", "直営自動車"]] as const) {
    await selectClassification(app.getByRole("combobox", { name, exact: true }), value!);
  }
  const cell = (row: number, month: number) => app.getByRole("spinbutton", { name: `売上高 ${month}月の金額`, exact: true }).nth(row);
  const start = (await cell(0, 4).boundingBox())!;
  const end = (await cell(1, 5).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down(); await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 }); await page.mouse.up();
  await expect(app.locator(".initiative-cell-selected")).toHaveCount(4);
  await paste(cell(0, 4), "-0.001");
  await app.getByRole("button", { name: "登録", exact: true }).click();
  await app.getByRole("button", { name: "範囲入力の保存確認", exact: true }).click();
  for (const row of [0, 1]) for (const month of [4, 5]) await expect(cell(row, month)).toHaveValue("-0.001");
  await cell(0, 4).click(); await cell(0, 4).press("Shift+ArrowRight");
  await paste(cell(0, 5), "12.345");
  await expect(app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true })).toBeEnabled();
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "範囲入力の保存確認", exact: true }).click();
  await expect(cell(0, 4)).toHaveValue("12.345");
  await expect(cell(0, 5)).toHaveValue("12.345");
  await expect(cell(1, 4)).toHaveValue("-0.001");
});

test("範囲の自動保存が失敗しても入力と未変更セルを保持する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await page.getByLabel("ファイル操作", { exact: true }).selectOption("save-failure");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "展開表", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first();
  const may = app.getByRole("spinbutton", { name: "売上高 5月の金額", exact: true }).first();
  const june = app.getByRole("spinbutton", { name: "売上高 6月の金額", exact: true }).first();
  await april.click(); await april.press("Shift+ArrowRight");
  await paste(may, "-0.001");
  await expect(app.getByRole("alert")).toContainText("自動保存できませんでした");
  await expect(april).toHaveValue("-0.001"); await expect(may).toHaveValue("-0.001");
  await expect(june).toHaveValue("130");
  await expect(app.getByRole("button", { name: "← 展開表へ戻る", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "保存を再試行", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("自動保存できませんでした");
  await expect(april).toHaveValue("-0.001");
  await app.getByRole("button", { name: "入力を取り消す", exact: true }).click();
  await expect(april).toHaveValue("120"); await expect(may).toHaveValue("125");
});


test("金額項目の3合計は入力と種別に追従する", async ({ app }) => {
  const table = app.getByRole("table", { name: "月別計画金額", exact: true });
  const footer = table.locator("tfoot");
  await expect(footer.getByRole("row")).toHaveCount(3);
  const sales = footer.getByRole("row", { name: /^売上合計/ });
  await expect(sales.getByRole("cell").first()).toHaveText("0");
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true });
  await april.nth(0).fill("1200.125");
  await april.nth(1).fill("25.375");
  await expect(sales.getByRole("cell").first()).toHaveText("1,226");
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await april.nth(0).fill("0");
  await expect(sales.getByRole("cell").first()).toHaveText("25");
  await app.getByRole("button", { name: "＋ 勘定科目を追加", exact: true }).click();
  await app.getByRole("combobox", { name: "3行目の勘定科目", exact: true }).focus();
  await selectAccount(app.getByRole("combobox", { name: "3行目の勘定科目", exact: true }), { label: "旅費" });
  await expect(footer.getByRole("row")).toHaveCount(3);
  await expect(footer.getByRole("row", { name: /^費用合計/ }).getByRole("cell").first()).toHaveText("0");
  await expect(footer.getByRole("rowheader", { name: "売上原価合計", exact: true })).toHaveCount(0);
  await expect(footer.getByRole("rowheader", { name: "利益合計", exact: true })).toHaveCount(1);
  await app.getByRole("button", { name: "3行目を削除", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "削除", exact: true }).click();
  await expect(footer.getByRole("row")).toHaveCount(3);
});


test("上部全体と月見出しを新規・登録済みの両方で固定する", async ({ page, app }, testInfo) => {
  if (testInfo.project.name === "narrow") await page.setViewportSize({ width: 375, height: 1100 });
  for (let row = 3; row <= 14; row++) {
    await app.getByRole("button", { name: "＋ 勘定科目を追加", exact: true }).click();
    const account = app.getByRole("combobox", { name: `${row}行目の勘定科目`, exact: true });
    await account.focus(); await selectAccount(account, "1");
  }
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("ヘッダー固定確認");
  for (const [name, value] of [["展開名", "コスト"], ["部署名", "部署A"], ["業種名", "直営自動車"]] as const) {
    await selectClassification(app.getByRole("combobox", { name, exact: true }), value);
  }
  const grid = app.locator(".initiative-grid-scroll");
  const positions = () => app.locator(".initiative-entry-page").evaluate(node => {
    const elements = [...node.children].filter(child => !child.classList.contains("initiative-amount-table-container") && !child.classList.contains("initiative-row-actions"));
    elements.push(node.querySelector("thead")!);
    return elements.map(element => ({ top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height }));
  });
  for (const saved of [false, true]) {
    if (saved) {
      await app.getByRole("button", { name: "登録", exact: true }).click();
      await app.getByRole("button", { name: "ヘッダー固定確認", exact: true }).click();
      await expect(app.getByRole("button", { name: "複製して新規作成", exact: true })).toBeVisible();
    }
    for (const kind of ["一次予算", "確定予算"]) {
      await app.getByRole("tab", { name: kind, exact: true }).click();
      await grid.evaluate(node => { node.scrollTop = 0; node.scrollLeft = 0; });
      await settleMotion(app.locator("body"));
      const before = await positions();
      for (const box of before) {
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.top + box.height).toBeLessThan(page.viewportSize()!.height);
      }
      const first = app.locator('.initiative-amount-table input[data-row="0"][data-column="0"]');
      const firstTop = (await first.boundingBox())!.y;
      await grid.evaluate(node => { node.scrollTop = 250; node.scrollLeft = 180; });
      await expect.poll(() => grid.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
      const after = await positions();
      expect(after.length).toBe(before.length);
      for (let i = 0; i < before.length; i++) {
        expect(Math.abs(after[i]!.top - before[i]!.top)).toBeLessThan(2);
        expect(Math.abs(after[i]!.height - before[i]!.height)).toBeLessThan(2);
      }
      expect((await first.boundingBox())!.y).toBeLessThan(firstTop - 100);
      const last = app.locator('.initiative-amount-table input[data-row="13"][data-column="11"]');
      await last.focus(); await last.fill("1.125");
      await expect(last).toHaveValue("1.125");
      const lastBox = (await last.boundingBox())!;
      const gridBox = (await grid.boundingBox())!;
      expect(lastBox.y).toBeGreaterThan(gridBox.y + 25);
      // スクロール位置の整数丸めによる1px未満の差を許容する。
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(gridBox.y + gridBox.height + 1);
      if (saved) await expect(app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true })).toBeEnabled();
    }
  }
  await page.screenshot({ path: testInfo.outputPath("initiative-fixed-header.png") });
});

for (const kind of ["一次予算", "確定予算"]) {
  test(`${kind}に金額を入力した新規行も金額を保持して科目変更・削除できる`, async ({ app }) => {
    await app.getByRole("tab", { name: kind, exact: true }).click();
    await app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first().fill("100.125");
    await selectAccount(app.getByRole("combobox", { name: "1行目の勘定科目", exact: true }), { label: "旅費" });
    await expect(app.getByRole("spinbutton", { name: "旅費 4月の金額", exact: true })).toHaveValue("100.125");
    await app.getByRole("button", { name: "1行目を削除", exact: true }).click();
    await app.getByRole("alertdialog").getByRole("button", { name: "削除", exact: true }).click();
    await expect(app.getByRole("spinbutton", { name: "旅費 4月の金額", exact: true })).toHaveCount(0);
    await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true })).toHaveValue("0");
    await expect(app.getByRole("button", { name: "2行目を削除", exact: true })).toHaveCount(0);
  });
}
