import { test, expect, settleMotion } from "./fixtures";

test.beforeEach(async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await app.getByRole("dialog").getByRole("searchbox").fill("既存商品の販売拡大");
  await app.getByRole("dialog").getByRole("searchbox").press("Enter");
});

test("年間の均等配分を確認・取消・反映し、保存後に一操作で戻せる", async ({ page, app }, info) => {
  const trigger = app.getByRole("button", { name: "年間金額を配分", exact: true });
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first();
  await trigger.click();
  const dialog = app.getByRole("dialog", { name: "年間金額を月別に配分", exact: true });
  await expect(dialog.getByRole("spinbutton", { name: "年間金額", exact: true })).toBeFocused();
  await dialog.getByRole("spinbutton", { name: "年間金額", exact: true }).fill("1");
  for (const month of [7, 8, 9, 10, 11, 12, 1, 2, 3]) await dialog.getByRole("checkbox", { name: `${month}月`, exact: true }).uncheck();
  await expect(dialog.getByRole("row", { name: /^4月/ })).toContainText("0.334");
  await expect(dialog.getByRole("row", { name: /^5月/ })).toContainText("0.333");
  await dialog.locator(".annual-allocation-scroll").evaluate(element => { element.scrollTop = 0; });
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadichrome-allocation-${info.project.name}.png` });
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).press("Escape");
  await expect(trigger).toBeFocused();
  await expect(april).toHaveValue("120");
  await trigger.click();
  await dialog.getByRole("spinbutton", { name: "年間金額", exact: true }).fill("1");
  await dialog.getByRole("button", { name: "配分を反映", exact: true }).click();
  await expect(april).toHaveValue("0.084");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).nth(1)).toHaveValue("30");
  const undo = app.getByRole("button", { name: "操作を取り消す", exact: true });
  await expect(undo).toBeEnabled(); await undo.click();
  await expect(april).toHaveValue("120");
});

test("確定の比率配分は全月を手修正にし、一次予算と他行を保持する", async ({ app }) => {
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await app.getByRole("button", { name: "年間金額を配分", exact: true }).click();
  const dialog = app.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "年間金額", exact: true }).fill("-0.005");
  await dialog.getByRole("combobox", { name: "配分方法", exact: true }).selectOption("ratio");
  for (const month of [6, 7, 8, 9, 10, 11, 12, 1, 2, 3]) await dialog.getByRole("checkbox", { name: `${month}月`, exact: true }).uncheck();
  await dialog.getByRole("spinbutton", { name: "5月の比率", exact: true }).fill("3");
  await expect(dialog.getByRole("row", { name: /^5月/ })).toContainText("-0.004");
  await dialog.getByRole("button", { name: "配分を反映", exact: true }).click();
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first();
  await expect(april).toHaveValue("-0.001");
  await expect(app.getByRole("spinbutton", { name: "売上高 6月の金額", exact: true }).first()).toHaveValue("0");
  await expect(app.getByRole("button", { name: "年間金額を配分", exact: true })).toBeEnabled();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(april).toHaveValue("120");
  await april.fill("121");
  await expect(app.getByRole("button", { name: "年間金額を配分", exact: true })).toBeEnabled();
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(april).toHaveValue("-0.001");
});

test("不正値や比率0では反映せず、登録前にも使え、過去閲覧では無効", async ({ app }) => {
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  await app.getByRole("button", { name: "年間金額を配分", exact: true }).click();
  const dialog = app.getByRole("dialog"), apply = dialog.getByRole("button", { name: "配分を反映", exact: true });
  await expect(apply).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "年間金額", exact: true }).fill("0.0001");
  await expect(apply).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "年間金額", exact: true }).fill("0");
  await dialog.getByRole("combobox", { name: "配分方法", exact: true }).selectOption("ratio");
  for (const month of [5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]) await dialog.getByRole("checkbox", { name: `${month}月`, exact: true }).uncheck();
  await dialog.getByRole("spinbutton", { name: "4月の比率", exact: true }).fill("0");
  await expect(apply).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "4月の比率", exact: true }).fill("1");
  await apply.click();
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("0");
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await app.getByRole("dialog").getByRole("searchbox").fill("既存商品の販売拡大");
  await app.getByRole("dialog").getByRole("searchbox").press("Enter");
  await expect(app.getByRole("button", { name: "年間金額を配分", exact: true })).toBeDisabled();
});

test("保存失敗では配分後の入力を保持し、入力取消で保存前へ戻せる", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?scenario=save-failure");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await app.getByRole("dialog").getByRole("searchbox").fill("既存商品の販売拡大");
  await app.getByRole("dialog").getByRole("searchbox").press("Enter");
  await app.getByRole("button", { name: "年間金額を配分", exact: true }).click();
  const dialog = app.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "年間金額", exact: true }).fill("12");
  await dialog.getByRole("button", { name: "配分を反映", exact: true }).click();
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first();
  await expect(app.getByRole("alert")).toContainText("自動保存できませんでした");
  await expect(april).toHaveValue("1");
  await expect(app.getByRole("button", { name: "年間金額を配分", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "入力を取り消す", exact: true }).click();
  await expect(april).toHaveValue("120");
  await expect(app.getByRole("button", { name: "年間金額を配分", exact: true })).toBeEnabled();
});
