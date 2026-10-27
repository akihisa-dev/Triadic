import { selectBudgets } from "./fixtures";
import type { Page, FrameLocator } from "@playwright/test";
import { test, expect, selectClassification, settleMotion } from "./fixtures";

async function openSample(page: Page, app: FrameLocator) {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
}

test("予算選択の列構成・重複防止・比較の符号と画面別の保存を確認する", async ({ page, app }, testInfo) => {
  await openSample(page, app);
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  const first = app.getByRole("checkbox", { name: "前年見込を基準にした一次予算", exact: true });
  const second = app.getByRole("checkbox", { name: "前年見込を基準にした確定予算", exact: true });
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  const cost = app.getByRole("table", { name: "総原価表", exact: true });
  await expect(first).toBeChecked();
  await expect(second).not.toBeChecked();
  await expect(cost.getByRole("columnheader", { name: "前年見込", exact: true })).toHaveCount(19);
  await expect(cost.getByRole("columnheader", { name: "確定予算", exact: true })).toHaveCount(0);
  await selectBudgets(app, [1, 2]);
  await expect(cost.getByRole("columnheader", { name: "確定予算", exact: true })).toHaveCount(19);
  await expect(first).toBeChecked();
  await selectBudgets(app, [1]);
  await selectBudgets(app, [2]);
  await expect(cost.getByRole("columnheader", { name: "一次予算", exact: true })).toHaveCount(0);
  await menu.getByRole("button", { name: "展開表", exact: true }).click();
  const expansion = app.getByRole("table", { name: "展開表", exact: true });
  await expect(first).toBeChecked();
  await expect(second).not.toBeChecked();
  await expect(expansion.getByRole("columnheader", { name: "前年見込", exact: true })).toHaveCount(19);
  await expect(expansion.getByRole("columnheader", { name: "差額", exact: true })).toHaveCount(0);
  await selectBudgets(app, [1, 2]);
  await expect(expansion.getByRole("columnheader", { name: "差額", exact: true })).toHaveCount(19);
  const total = expansion.getByRole("row").filter({ has: app.getByRole("rowheader", { name: "合計", exact: true }) });
  await expect(total.getByRole("cell").nth(6)).toHaveText("20");
  await selectBudgets(app, [1]);
  await selectBudgets(app, [2]);
  await selectBudgets(app, [1, 2]);
  await expect(total.getByRole("cell").nth(6)).toHaveText("20");
  // Constant comparison captions were intentionally removed; verify the actual table contract.
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await expect(expansion.getByRole("columnheader", { name: "差額", exact: true })).toHaveCount(19);
  const kindHeaders = expansion.locator("thead tr").nth(1).getByRole("columnheader");
  await expect(kindHeaders.nth(0)).toHaveText("前年見込");
  await expect(kindHeaders.nth(1)).toHaveText("一次予算");
  await expect(kindHeaders.nth(2)).toHaveText("確定予算");
  await expect(kindHeaders.nth(3)).toHaveText("差額");
  // The comparison stays confirmed minus primary even when the displayed kinds are reversed.
  await expect(total.getByRole("cell").nth(2)).toHaveText("20,757");
  await expect(total.getByRole("cell").nth(4)).toHaveText("20,777");
  await expect(total.getByRole("cell").nth(6)).toHaveText("20");
  await expect(total.getByRole("cell").nth(7)).toHaveText("20");
  await expect(total.getByRole("cell").nth(14)).toHaveText("-100");
  await expect(total.getByRole("cell").nth(15)).toHaveText("-100");
  const title = await app.getByRole("heading", { name: "展開表", exact: true }).boundingBox();
  const slots = await app.getByRole("group", { name: "予算の比較条件", exact: true }).boundingBox();
  expect(title).not.toBeNull();
  expect(slots).not.toBeNull();
  if (testInfo.project.name === "desktop") {
    expect(slots!.x).toBeGreaterThan(title!.x + title!.width);
    expect(title!.y).toBeGreaterThanOrEqual(slots!.y);
    expect(title!.y + title!.height).toBeLessThanOrEqual(slots!.y + slots!.height);
  } else {
    expect(slots!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  }
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  const listKind = app.getByRole("spinbutton", { name: "種別", exact: true });
  await expect(listKind).toHaveAttribute("aria-valuetext", "確定予算");
  await selectClassification(listKind, "一次予算");
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await expect(listKind).toHaveAttribute("aria-valuetext", "一次予算");
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await expect(first).not.toBeChecked();
  await expect(second).toBeChecked();
  await menu.getByRole("button", { name: "展開表", exact: true }).click();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/private/tmp/triadic-budget-slots-${testInfo.project.name}.png` });
});

test("一次予算の引き継ぎ・手修正0と前年入力を操作できる", async ({ page, app }) => {
  await openSample(page, app);
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "確定予算の下期調整", exact: true }).click();
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true });
  await expect(app.getByRole("tab")).toHaveCount(2);
  await april.fill("120");
  await expect(app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true })).toBeEnabled();
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(april).toHaveValue("120");
  await april.fill("0");
  await expect(april).toHaveValue("0");
  await expect(app.getByRole("button", { name: /^(一次予算を反映する|年間金額を配分|実施月をまとめて移動)$/ })).toHaveCount(0);
  await menu.getByRole("button", { name: "前年入力", exact: true }).click();
  await expect(app.getByRole("heading", { name: "前年入力", exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
  await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
  await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
  const previous = app.getByRole("textbox", { name: "売上高 4月の前年金額", exact: true });
  await previous.fill("1001");
  await previous.press("Enter");
  await expect(app.getByRole("combobox", { name: "部署名", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await expect(app.getByRole("heading", { name: "総原価表", exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
  await menu.getByRole("button", { name: "前年入力", exact: true }).click();
  await expect(app.getByRole("heading", { name: "前年入力", exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
  await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
  await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
  await expect(previous).toHaveValue("1001");
});

test("予算選択の保存失敗では選択と表を保持する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await page.getByLabel("ファイル操作", { exact: true }).selectOption("save-failure");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "展開表", exact: true }).click();
  const second = app.getByRole("checkbox", { name: "前年見込を基準にした確定予算", exact: true });
  await second.click();
  await expect(app.getByRole("alert")).toContainText("保存失敗");
  await expect(second).not.toBeChecked();
  await expect(app.getByRole("columnheader", { name: "差額", exact: true })).toHaveCount(0);
  await expect(second).toBeEnabled();
});

test("チェックをSpaceで切り替え、最後の選択と画面幅を保つ", async ({ page, app }) => {
  await openSample(page, app);
  await app.getByRole("navigation", {name:"メインナビゲーション"}).getByRole("button", {name:"総原価表",exact:true}).click();
  const first=app.getByRole("checkbox",{name:"前年見込を基準にした一次予算",exact:true});
  const second=app.getByRole("checkbox",{name:"前年見込を基準にした確定予算",exact:true});
  await first.press("Space"); await expect(first).toBeChecked();
  await second.press("Space"); await expect(second).toBeChecked();
  await second.press("Space"); await expect(second).not.toBeChecked();
  expect(await app.locator("body").evaluate(node=>node.scrollWidth>window.innerWidth)).toBe(false);
});
