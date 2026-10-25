import { test, expect, settleMotion } from "./fixtures";

test.beforeEach(async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
});

test("複製した全種別を調整して登録し、元の施策と独立して取り消せる", async ({ page, app }, info) => {
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  const name = app.getByRole("textbox", { name: "施策名", exact: true });
  const april = app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first();
  await expect(name).toHaveValue("既存商品の販売拡大（コピー）");
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(april).toHaveValue("120");
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(april).toHaveValue("130");
  await expect(app.getByRole("spinbutton", { name: "売上高 11月の金額", exact: true }).first()).toHaveValue("0");
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await april.fill("120.001");
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadic-duplicate-${info.project.name}.png` });
  await app.getByRole("button", { name: "登録", exact: true }).click();
  await expect(app.getByRole("button", { name: "既存商品の販売拡大（コピー）", exact: true })).toBeVisible();
  await app.getByRole("button", { name: "操作を取り消す", exact: true }).click();
  await expect(app.getByRole("button", { name: "既存商品の販売拡大（コピー）", exact: true })).toHaveCount(0);
  await app.getByRole("button", { name: "操作をやり直す", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大（コピー）", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(april).toHaveValue("120.001");
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  await expect(name).toHaveValue("既存商品の販売拡大（コピー）（コピー）");
  await app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "破棄して一覧へ戻る", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(april).toHaveValue("120");
});

test("保持中の登録前入力を確認前に置き換えず、取消・承認を選べる", async ({ app }) => {
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  const name = app.getByRole("textbox", { name: "施策名", exact: true });
  await name.fill("保持したい入力");
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "Home", exact: true }).click();
  await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
  await expect(name).toHaveValue("保持したい入力");
  await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  const dialog = app.getByRole("alertdialog");
  await expect(dialog).toContainText("複製に置き換えます");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await app.getByRole("button", { name: "次の画面に進む", exact: true }).click();
  await expect(name).toHaveValue("保持したい入力");
  await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  await dialog.getByRole("button", { name: "破棄して複製する", exact: true }).click();
  await expect(name).toHaveValue("既存商品の販売拡大（コピー）");
  await expect(app.getByRole("button", { name: "登録", exact: true })).toBeEnabled();
});

test("未保存の編集と過去閲覧では複製できない", async ({ app }) => {
  const button = app.getByRole("button", { name: "複製して新規作成", exact: true });
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("保存する前の名前");
  await expect(button).toBeDisabled();
  await expect(button).toBeEnabled();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await expect(button).toBeDisabled();
});

test("複製の登録失敗では入力を保持し、元の施策へ影響しない", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?scenario=save-failure");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  await app.getByRole("button", { name: "登録", exact: true }).click();
  await expect(app.getByRole("alert")).toBeVisible();
  await expect(app.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue("既存商品の販売拡大（コピー）");
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("120");
  await app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "破棄して一覧へ戻る", exact: true }).click();
  await expect(app.getByRole("button", { name: "既存商品の販売拡大（コピー）", exact: true })).toHaveCount(0);
  await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
  await app.getByRole("tab", { name: "一次予算", exact: true }).click();
  await expect(app.getByRole("tab", { name: "一次予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(app.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true }).first()).toHaveValue("120");
});
