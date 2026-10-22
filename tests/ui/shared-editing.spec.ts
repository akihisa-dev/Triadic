import { test, expect } from "./fixtures";

test.beforeEach(async ({ page, app }) => {
  await page.goto("/tests/ui/shared-editing.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "同じ名前", exact: true }).click();
});

test("同じ番号の別施策へ旧入力を保存せず、入力を回収して独立登録できる", async ({ page, app }) => {
  const name = app.getByRole("textbox", { name: "施策名", exact: true });
  const note = app.getByRole("textbox", { name: "備考", exact: true });
  await name.fill(""); await note.fill("保護する旧入力");
  await expect(app.getByRole("alert")).toContainText("自動保存できませんでした");
  await page.getByRole("button", { name: "別ウィンドウから置換を反映", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("置換を反映しました");
  await expect(app.getByRole("alert")).toContainText("編集対象が別のデータ");
  await name.fill("引き継ぐ施策");
  await expect(note).toHaveValue("保護する旧入力");
  await expect(app.getByRole("button", { name: "保存を再試行", exact: true })).toBeDisabled();
  const read = async () => JSON.parse(await page.getByLabel("SQLite保存内容", { exact: true }).innerText()) as { initiatives: { id: number; name: string; note: string }[] };
  const original = (await read()).initiatives[0];
  expect(original?.name).toBe("置換後の施策"); expect(original?.note).toBe("置換先の備考");
  await app.getByRole("button", { name: "新規施策として入力を引き継ぐ", exact: true }).click();
  await expect(name).toHaveValue("引き継ぐ施策"); await expect(note).toHaveValue("保護する旧入力");
  // Ordinary validation still applies and failure keeps the recovered input.
  await app.getByRole("button", { name: "登録", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("勘定科目を一つ以上");
  const account = app.getByRole("combobox", { name: "1行目の勘定科目", exact: true });
  await account.focus(); await account.selectOption({ label: "売上高" });
  await app.getByRole("button", { name: "登録", exact: true }).click();
  await expect(app.getByRole("button", { name: "引き継ぐ施策", exact: true })).toBeVisible();
  expect((await read()).initiatives[0]).toEqual(original);
  expect((await read()).initiatives[1]?.note).toBe("保護する旧入力");
  await app.getByRole("button", { name: "操作を取り消す", exact: true }).click();
  await expect(app.getByRole("button", { name: "引き継ぐ施策", exact: true })).toHaveCount(0);
  await app.getByRole("button", { name: "操作をやり直す", exact: true }).click();
  await expect(app.getByRole("button", { name: "引き継ぐ施策", exact: true })).toBeVisible();
  expect((await read()).initiatives[0]).toEqual(original);
});

test("保持中の新規入力の置き換えを取消でき、入力取消では最新の置換先を表示する", async ({ page, app }) => {
  const name = app.getByRole("textbox", { name: "施策名", exact: true });
  const note = app.getByRole("textbox", { name: "備考", exact: true });
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  await name.fill("先に保持した新規入力");
  await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
  await expect(app.getByRole("button", { name: "複製して新規作成", exact: true })).toBeVisible();
  await name.fill(""); await note.fill("旧施策への入力");
  await expect(app.getByRole("alert")).toContainText("自動保存できませんでした");
  await page.getByRole("button", { name: "別ウィンドウから置換を反映", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("編集対象が別のデータ");
  const recover = app.getByRole("button", { name: "新規施策として入力を引き継ぐ", exact: true });
  await recover.click();
  const dialog = app.getByRole("alertdialog");
  await expect(dialog).toContainText("保持中の登録前の入力を破棄して");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(note).toHaveValue("旧施策への入力");
  await app.getByRole("button", { name: "入力を取り消す", exact: true }).click();
  await expect(name).toHaveValue("置換後の施策"); await expect(note).toHaveValue("置換先の備考");
  await app.getByRole("button", { name: "次の画面に進む", exact: true }).click();
  await expect(name).toHaveValue("先に保持した新規入力");
});
