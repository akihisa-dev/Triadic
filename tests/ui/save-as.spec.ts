import { test, expect, selectClassification } from "./fixtures";

test("別名保存後も同じ画面と操作取消を保ち、新しいファイルから再開する", async ({ page, app }, testInfo) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const menu = app.getByRole("complementary", { name: "メニュー", exact: true });
  await menu.getByRole("button", { name: "総原価表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象1", exact: true }), "確定予算");
  const save = menu.getByRole("button", { name: "別名で保存", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(app.locator(".home-file-name")).toHaveText("画面テスト のコピー.triadic");
  await expect(app.getByRole("heading", { name: "総原価表", exact: true })).toBeVisible();
  await expect(app.getByRole("spinbutton", { name: "比較対象1", exact: true })).toContainText("確定予算");
  await expect(app.getByText("別名で保存しました。", { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/triadic-save-as-${testInfo.project.name}.png` });
  const undo = app.getByRole("button", { name: "操作を取り消す", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(app.getByRole("spinbutton", { name: "比較対象1", exact: true })).toContainText("一次予算");
  await menu.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(app.getByRole("button", { name: "続きから", exact: true })).toBeEnabled();
  await app.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(app.locator(".home-file-name")).toHaveText("画面テスト のコピー.triadic");
});

for (const reason of ["cancel", "same", "failure"] as const) test(`別名保存の${reason}では元のファイルと編集画面を保持する`, async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const frame = page.frames().find(frame => frame !== page.mainFrame())!;
  await frame.evaluate(reason => {
    const target = window as unknown as Window & { showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>; showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    const picker = target.showSaveFilePicker;
    target.showSaveFilePicker = async options => {
      if (reason === "cancel") throw new DOMException("取消", "AbortError");
      if (reason === "same") return (await target.showOpenFilePicker())[0]!;
      const handle = await picker(options);
      handle.createWritable = async () => { throw new Error("別名保存の書き込み失敗"); };
      return handle;
    };
  }, reason);
  await app.getByRole("button", { name: "別名で保存", exact: true }).click();
  await expect(app.getByRole("button", { name: "別名で保存", exact: true })).toBeEnabled();
  await expect(app.locator(".home-file-name")).toHaveText("画面テスト.triadic");
  await expect(app.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  if (reason !== "cancel") await expect(app.getByRole("alert")).toContainText(reason === "same" ? "元のファイルとは別" : "書き込み失敗");
  else await expect(app.getByRole("alert")).toHaveCount(0);
});

test("登録前の入力と過去閲覧中は別名保存できない", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const menu = app.getByRole("complementary", { name: "メニュー", exact: true });
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("button", { name: "施策を追加", exact: true }).click();
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("登録前の施策");
  await expect(menu.getByRole("button", { name: "別名で保存", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "破棄して一覧へ戻る", exact: true }).click();
  await expect(menu.getByRole("button", { name: "別名で保存", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "履歴", exact: true }).click();
  await app.locator(".history-date").last().click();
  await expect(menu.getByRole("button", { name: "別名で保存", exact: true })).toBeDisabled();
});
