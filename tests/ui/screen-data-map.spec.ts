import { test, expect, settleMotion } from "./fixtures";
import { dataTables, screenData } from "../../Triadic-extension/src/extension/screenDataModel";

test("全画面の対応・説明・保存項目・参照先を省略せずに閲覧できる", async ({ app }) => {
  test.setTimeout(90_000);
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "一次予算", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "Home", exact: true }).click();
  await app.getByRole("heading", { name: "Home", exact: true }).click();
  await settleMotion(app.locator("body"));
  await app.getByRole("button", { name: "画面とデータ", exact: true }).click();
  const map = app.getByRole("region", { name: "画面とデータの対応図" });
  for (const screen of screenData) {
    await map.getByRole("navigation").getByRole("button", { name: screen.name, exact: true }).click();
    await expect(map.locator(".screen-data-calculated p")).toHaveText(screen.calculated);
    expect(await map.locator(".screen-data-summary tbody tr").evaluateAll(rows => rows.map(row => ({
      fields: Array.from(row.querySelectorAll("li"), item => item.textContent),
      table: row.querySelector("code")!.textContent,
      purpose: row.querySelectorAll("td")[2]!.textContent,
    })))).toEqual(screen.tables.map(usage => ({
      fields: usage.fields.map(name => dataTables.find(table => table.name === usage.table)!.columns.find(column => column.name === name)!.label),
      table: usage.table, purpose: usage.purpose,
    })));
    for (const usage of screen.tables) {
      const table = dataTables.find(item => item.name === usage.table)!;
      const detail = map.locator(`#screen-data-${table.name}`);
      const button = detail.locator(".screen-data-table-heading");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await button.click();
      await expect(detail.locator(".screen-data-columns")).toBeVisible();
      expect(await detail.locator("tbody tr").evaluateAll(rows => rows.map(row =>
        Array.from(row.querySelectorAll("td"), cell => cell.textContent))))
        .toEqual(table.columns.map(column => [column.label, column.name, column.reference ?? "—"]));
    }
  }
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
});

test("画面の保存項目と参照先をたどり、関連図の入口へ戻れる", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "一次予算", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "Home", exact: true }).click();
  await app.getByRole("heading", { name: "Home", exact: true }).click();
  await settleMotion(app.locator("body"));
  await app.getByRole("button", { name: "画面とデータ", exact: true }).click();
  const map = app.getByRole("region", { name: "画面とデータの対応図" });
  await expect(map.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
  const info = map.locator("#screen-data-document_info");
  await expect(info.locator(".screen-data-table-heading")).toContainText("基本情報");
  await expect(info.locator(".screen-data-table-heading")).toContainText("document_info");
  await info.locator(".screen-data-table-heading").click();
  await expect(info.locator(".screen-data-columns")).toContainText("作成日時");
  await expect(info.locator(".screen-data-columns")).toContainText("更新日時");
  await expect(map.locator("#screen-data-plan")).toHaveCount(0);
  await expect(map.locator("#screen-data-initiatives")).not.toContainText("primary_start_year_month");
  await expect(map).toContainText("読み込み時に導出し、保存しません");
  await map.getByRole("navigation").getByRole("button", { name: "施策詳細", exact: true }).click();
  await map.locator("#screen-data-initiatives .screen-data-table-heading").click();
  await map.getByRole("button", { name: "expansion_category_assignments.expansion_id, expansions.id", exact: true }).click();
  await expect(map.locator("#screen-data-expansion_category_assignments .screen-data-columns")).toBeVisible();
  await map.locator("#screen-data-expansion_category_assignments").getByRole("button", { name: "expansions.id", exact: true }).click();
  await expect(map.locator("#screen-data-expansions .screen-data-columns")).toBeVisible();
  await expect(map.locator("#screen-data-expansions .screen-data-table-heading")).toBeFocused();
  const screens = map.getByRole("navigation");
  await screens.getByRole("button", { name: "総原価表", exact: true }).click();
  await expect(map.locator("#screen-data-aggregation_members")).toBeVisible();
  await expect(map).toContainText("総原価表専用の保存テーブルはありません");
  await screens.getByRole("button", { name: "種別マスタ", exact: true }).click();
  await expect(map.locator(".screen-data-table")).toHaveCount(1);
  await expect(map).toContainText("アプリの固定定義");
  for (const name of ["施策入力", "施策詳細", "前年入力", "展開表", "勘定科目マスタ", "展開マスタ", "業種マスタ", "部署マスタ", "期間マスタ", "履歴"]) {
    await screens.getByRole("button", { name, exact: true }).click();
    await expect(map.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(map).toContainText("data_history_state");
  await expect.poll(() => map.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await app.getByRole("button", { name: "関連図", exact: true }).click();
  await settleMotion(app.locator("body"));
  await expect(app.getByRole("region", { name: "画面とマスタの相関図" })).toBeVisible();
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  const initiatives = app.getByRole("main", { name: "ホーム" }).getByRole("button", { name: "施策一覧", exact: true });
  await initiatives.press("Enter");
  await expect(initiatives).toHaveAttribute("aria-pressed", "true");
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toHaveCount(0);
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await initiatives.press("Enter");
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});
