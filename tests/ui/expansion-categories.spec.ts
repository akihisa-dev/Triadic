import { selectAccount, openInitiativeEntry, test, expect } from "./fixtures";

async function openMasters(page: import("@playwright/test").Page, app: import("@playwright/test").FrameLocator) {
  await page.getByLabel("テストデータ", { exact: true }).selectOption("defaults");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "マスタ", exact: true }).click();
  await app.getByRole("button", { name: /^展開区分マスタ/ }).click();
}

test("区分の登録時に所属展開を必須選択し、展開マスタには所属区分だけを表示する", async ({ page, app }) => {
  await openMasters(page, app);
  const form = app.getByRole("form", { name: "展開区分の新規登録" });
  await form.getByRole("textbox", { name: "展開区分名", exact: true }).fill("料金の区分");
  await expect(form.getByRole("button", { name: "登録", exact: true })).toBeDisabled();
  await form.getByRole("combobox", { name: "展開名", exact: true }).selectOption("2");
  await form.getByRole("button", { name: "登録", exact: true }).click();
  const row = app.getByRole("row").filter({ has: app.getByRole("button", { name: "料金の区分を編集", exact: true }) });
  await expect(row).toContainText("料金改定");
  await row.getByRole("button", { name: "料金の区分を編集", exact: true }).click();
  await app.locator(".master-row-editing").getByRole("combobox", { name: "料金の区分の展開名", exact: true }).selectOption("3");
  await expect(app.getByRole("button", { name: "完了", exact: true })).toBeEnabled();
  await app.getByRole("button", { name: "完了", exact: true }).click();
  await expect(row).toContainText("荷主撤退");
  await app.getByRole("button", { name: "← マスタへ戻る", exact: true }).click();
  await app.getByRole("button", { name: /^展開マスタ/ }).click();
  const expansionRow = app.getByRole("row").filter({ has: app.getByRole("button", { name: "荷主撤退を編集", exact: true }) });
  await expect(expansionRow).toContainText("料金の区分");
  await expansionRow.getByRole("button", { name: "荷主撤退を編集", exact: true }).click();
  await expect(app.getByRole("checkbox")).toHaveCount(0);
  await expect(app.locator(".master-row-editing")).toContainText("料金の区分");
  await app.getByRole("button", { name: "完了", exact: true }).click();
});

test("展開名を変えると区分を解除し、他展開では選択できず、使用中の所属変更と削除を拒否する", async ({ page, app }) => {
  await openMasters(page, app);
  await app.getByRole("button", { name: "設備投資を編集", exact: true }).click();
  await app.getByRole("combobox", { name: "設備投資の展開名", exact: true }).selectOption("2");
  await expect(app.getByRole("button", { name: "完了", exact: true })).toBeEnabled();
  await app.getByRole("button", { name: "完了", exact: true }).click();
  await openInitiativeEntry(app);
  const expansion = app.getByRole("combobox", { name: "展開名", exact: true });
  const category = app.getByRole("combobox", { name: "展開区分", exact: true });
  await expect(category).toBeDisabled();
  await expansion.selectOption("1");
  await expect(category.locator("option")).toHaveText(["未選択", "下払いUP", "ベースアップ", "燃料費UP", "電気料金UP", "その他"]);
  await category.selectOption("1");
  await expansion.selectOption("2");
  await expect(category).toHaveValue("");
  await expect(category.locator("option")).toHaveText(["未選択", "設備投資"]);
  await category.selectOption("3");
  await expansion.selectOption("3"); await expect(category).toBeDisabled();
  await expansion.selectOption("2"); await expect(category).toHaveValue("");
  await app.getByRole("combobox", { name: "部署名", exact: true }).selectOption("1");
  await app.getByRole("combobox", { name: "業種名", exact: true }).selectOption("1");
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("展開区分の確認");
  const account = app.getByRole("combobox", { name: "1行目の勘定科目" }); await account.focus(); await selectAccount(account, "1");
  await app.getByRole("button", { name: "登録", exact: true }).click();
  await app.getByRole("button", { name: "展開区分の確認", exact: true }).click();
  await expect(category).toHaveValue("");
  await category.selectOption("3");
  const back = app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }); await expect(back).toBeEnabled(); await back.click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "マスタ", exact: true }).click();
  await app.getByRole("button", { name: /^展開区分マスタ/ }).click();
  await expect(app.getByRole("button", { name: "設備投資を削除", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "設備投資を編集", exact: true }).click();
  await app.getByRole("combobox", { name: "設備投資の展開名", exact: true }).selectOption("1");
  await expect(app.getByText("施策で使用中の展開区分は所属する展開名を変更できません。")).toBeVisible();
});

test("未登録施策で選択中の区分も所属変更と削除から保護する", async ({ page, app }) => {
  await openMasters(page, app);
  await openInitiativeEntry(app);
  await app.getByRole("combobox", { name: "展開名", exact: true }).selectOption("1");
  await app.getByRole("combobox", { name: "展開区分", exact: true }).selectOption("3");
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "マスタ", exact: true }).click();
  await app.getByRole("button", { name: /^展開区分マスタ/ }).click();
  await expect(app.getByRole("button", { name: "設備投資を削除", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "設備投資を編集", exact: true }).click();
  await app.getByRole("combobox", { name: "設備投資の展開名", exact: true }).selectOption("2");
  await expect(app.getByText("施策入力で選択している展開区分は所属する展開名を変更できません。")).toBeVisible();
});
