import { selectBudgets } from "./fixtures";
import { test, expect, settleMotion, selectClassification } from "./fixtures";
import type { FrameLocator, Locator } from "@playwright/test";
async function revealAmount(button: Locator) {
  await button.evaluate(node => {
    const region = node.closest(".cost-table-container")!;
    const boundary = region.querySelector("th")!.getBoundingClientRect().right;
    region.scrollLeft += node.getBoundingClientRect().left - boundary - 8;
  });
}
async function closeMenu(app: FrameLocator) {
  const close = app.getByRole("button", { name: "サイドバーを閉じる", exact: true }).last();
  if (await close.isVisible()) await close.click();
  await settleMotion(app.locator("body"));
}

test("金額と期間計・差額の内訳を開き、閉じると元の金額に戻る", async ({ page, app }, testInfo) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("complementary", { name: "メニュー", exact: true }).getByRole("button", { name: "総原価表", exact: true }).click();
  await closeMenu(app);
  const button = app.getByRole("button", { name: "売上高 4月 一次予算の内訳", exact: true });
  await button.focus();
  await button.press("Enter");
  const dialog = app.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await settleMotion(app.locator("body"));
  await expect(dialog.getByRole("row").last()).toContainText("25,640");
  await page.screenshot({ path: `/tmp/triadic-cost-breakdown-${testInfo.project.name}.png` });
  await expect(dialog.getByRole("rowheader", { name: "前年見込", exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "既存商品の販売拡大（1行目）", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  const annual = app.getByRole("button", { name: "売上高 年間計 一次予算−前年の内訳", exact: true });
  await revealAmount(annual);
  await annual.click();
  await expect(dialog.getByRole("rowheader", { name: "前年見込", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("heading")).toHaveText("売上高 年間計 一次予算−前年の内訳");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await selectBudgets(app, [1, 2]);
  const difference = app.getByRole("button", { name: "売上高 4月 確定予算−一次予算の内訳", exact: true });
  await revealAmount(difference);
  await difference.click();
  await expect(dialog.getByRole("row").last()).toContainText("30");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(app.getByRole("button", { name: /利益率.*の内訳/ })).toHaveCount(0);
  await expect(app.getByRole("button", { name: /編集・削除確認用集計.*の内訳/ })).toHaveCount(0);
});

test("分類を絞った内訳から確定予算を編集し、元の分類と表示位置へ戻る", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("complementary", { name: "メニュー", exact: true }).getByRole("button", { name: "総原価表", exact: true }).click();
  await closeMenu(app);
  await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
  await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
  await selectBudgets(app, [2]);
  const cell = app.getByRole("button", { name: "宣伝広告費 3月 確定予算の内訳", exact: true });
  await cell.scrollIntoViewIfNeeded();
  await revealAmount(cell);
  const prepared = await app.locator(".cost-table-container").evaluate(node => ({ top: node.scrollTop, left: node.scrollLeft }));
  expect(prepared.top).toBeGreaterThan(0);
  expect(prepared.left).toBeGreaterThan(0);
  const original = Number((await cell.textContent())!.replaceAll(",", ""));
  await cell.click();
  const dialog = app.getByRole("dialog");
  await expect(dialog.getByRole("row").last()).toContainText(await cell.textContent() ?? "");
  const previous = dialog.getByRole("rowheader", { name: "前年見込", exact: true });
  await expect(previous).toHaveCount(0); // This expense has no previous-year amount.
  const contribution = dialog.getByRole("row").filter({ has: app.getByRole("button", { name: "既存商品の販売拡大（4行目）", exact: true }) });
  await expect(contribution).toContainText("部署A");
  await expect(contribution).toContainText("直営自動車");
  const scroll = app.locator(".cost-table-container");
  const before = await scroll.evaluate(node => ({ top: node.scrollTop, left: node.scrollLeft }));
  expect(before.top).toBeGreaterThan(0);
  expect(before.left).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "既存商品の販売拡大（4行目）", exact: true }).click();
  await expect(app.getByRole("tab", { name: "確定予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await app.getByRole("spinbutton", { name: "宣伝広告費 3月の金額", exact: true }).first().fill("9");
  const back = app.getByRole("button", { name: "← 総原価表へ戻る", exact: true });
  await expect(back).toBeEnabled();
  await back.click();
  await expect(app.getByRole("combobox", { name: "部署名", exact: true })).toHaveValue("1");
  await expect(app.getByRole("combobox", { name: "業種名", exact: true })).toHaveValue("1");
  await expect(app.getByRole("checkbox", { name: "前年見込を基準にした確定予算", exact: true })).toBeChecked();
  const expected = (original + 1).toLocaleString("ja-JP");
  await expect(cell).toHaveText(expected);
  await settleMotion(app.locator("body"));
  expect(await scroll.evaluate(node => ({ top: node.scrollTop, left: node.scrollLeft }))).toEqual(before);
  await revealAmount(cell);
  await cell.click();
  await expect(dialog.getByRole("row").last()).toContainText(expected);
});

test("過去の内訳から開いた施策は同じ時点の参照専用になる", async ({ page, app }, info) => {
  // The preview toolbar and past-state header need vertical room above the table.
  // Keep narrow-width coverage, as in the existing tall-header table tests.
  if (info.project.name === "narrow") await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/tests/ui/preview.html?data=full");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await expect(app.getByRole("button", { name: "現在に戻る", exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await closeMenu(app);
  await app.getByRole("button", { name: "売上高 4月 一次予算の内訳", exact: true }).click();
  await app.getByRole("dialog").getByRole("button", { name: "既存商品の販売拡大（1行目）", exact: true }).click();
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("100");
  await expect(app.getByRole("textbox", { name: "施策名", exact: true })).toBeDisabled();
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toBeDisabled();
});


test("内訳の全6列を昇降順に並べ替え、合計と施策への移動を保つ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("complementary", { name: "メニュー", exact: true }).getByRole("button", { name: "総原価表", exact: true }).click();
  await closeMenu(app);
  const amount = app.getByRole("button", { name: "営業利益 4月 一次予算の内訳", exact: true });
  await amount.focus(); await amount.press("Enter");
  const dialog = app.getByRole("dialog"), rows = dialog.locator("tbody tr[data-window-row]");
  const readRows = () => rows.evaluateAll(nodes => nodes.map(node => Array.from(node.children, cell => cell.textContent ?? "")));
  const original = await readRows(), total = await dialog.locator("tfoot").textContent();
  expect(original.length).toBeGreaterThan(3);
  expect(original.some(row => row[4] === "−")).toBe(true);
  const labels = ["前年・施策", "科目", "部署", "業種", "集計の加減", "反映額"];
  for (const [column, label] of labels.entries()) {
    const button = dialog.getByRole("button", { name: label, exact: true });
    for (const direction of ["ascending", "descending"]) {
      await button.press("Enter");
      await expect(dialog.getByRole("columnheader", { name: label, exact: true })).toHaveAttribute("aria-sort", direction);
      await expect(dialog.locator("th[aria-sort]")).toHaveCount(1);
      const sign = direction === "ascending" ? 1 : -1;
      const numeric = (value: string) => value === "−" ? -1 : value === "＋" ? 1 : Number(value.replaceAll(",", ""));
      const expected = [...original].sort((a, b) => sign * (column >= 4 ? numeric(a[column]!) - numeric(b[column]!) : a[column]!.localeCompare(b[column]!, "ja", { numeric: true })));
      await expect.poll(readRows).toEqual(expected);
      await expect(dialog.locator("tfoot")).toHaveText(total!);
    }
  }
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(amount).toBeFocused();
  await amount.press("Enter");
  await expect.poll(readRows).toEqual(original);
  await expect(dialog.locator("th[aria-sort]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "前年・施策", exact: true }).click();
  await dialog.getByRole("button", { name: "既存商品の販売拡大（1行目）", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
});
