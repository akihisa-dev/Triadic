import { test, expect, settleMotion } from "./fixtures";

async function openTarget(app: import("@playwright/test").FrameLocator, name = "季節キャンペーン") {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await app.getByRole("dialog").getByRole("searchbox").fill(name);
  await app.getByRole("dialog").getByRole("searchbox").press("Enter");
}
test("全行の移動プレビュー・取消・保存・一操作の取消とやり直し", async ({ page, app }, info) => {
  await page.goto("/tests/ui/preview.html"); await openTarget(app);
  const trigger = app.getByRole("button", { name: "実施月をまとめて移動", exact: true });
  await trigger.click();
  const dialog = app.getByRole("dialog"), apply = dialog.getByRole("button", { name: "全科目行に移動を反映", exact: true });
  await expect(dialog.getByRole("combobox", { name: "移動方向", exact: true })).toBeFocused();
  await dialog.getByRole("combobox", { name: "移動月数", exact: true }).selectOption("2");
  await expect(dialog.getByRole("row", { name: /^8月/ })).toContainText("50");
  await dialog.getByRole("combobox", { name: "確認する科目行", exact: true }).selectOption("2");
  await expect(dialog.getByRole("row", { name: /^7月/ })).toContainText("15");
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadichrome-month-shift-${info.project.name}.png` });
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).press("Escape");
  await expect(trigger).toBeFocused();
  await expect(app.getByRole("spinbutton", { name: "売上高 6月の金額", exact: true })).toHaveValue("50");
  await trigger.click(); await dialog.getByRole("combobox", { name: "移動月数", exact: true }).selectOption("2"); await apply.click();
  await expect(app.getByRole("spinbutton", { name: "売上高 8月の金額", exact: true })).toHaveValue("50");
  await expect(app.getByRole("spinbutton", { name: "宣伝広告費 7月の金額", exact: true })).toHaveValue("15");
  await app.getByRole("tab", { name: "確定予算", exact: true }).click();
  await expect(app.getByRole("spinbutton", { name: "売上高 8月の金額", exact: true })).toHaveValue("50");
  const undo = app.getByRole("button", { name: "操作を取り消す", exact: true }); await expect(undo).toBeEnabled(); await undo.click();
  await expect(app.getByRole("spinbutton", { name: "売上高 6月の金額", exact: true })).toHaveValue("50");
  await app.getByRole("button", { name: "操作をやり直す", exact: true }).click();
  await expect(app.getByRole("spinbutton", { name: "売上高 8月の金額", exact: true })).toHaveValue("50");
});
test("年度外は拒否し、登録前の移動で元施策を変更しない", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html"); await openTarget(app, "既存商品の販売拡大");
  await app.getByRole("button", { name: "実施月をまとめて移動", exact: true }).click();
  await expect(app.getByRole("dialog").getByRole("alert")).toContainText("3月");
  await expect(app.getByRole("dialog").getByRole("button", { name: "全科目行に移動を反映", exact: true })).toBeDisabled();
  await app.getByRole("dialog").getByRole("button", { name: "キャンセル", exact: true }).click();
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await app.getByRole("dialog").getByRole("searchbox").fill("季節キャンペーン"); await app.getByRole("dialog").getByRole("searchbox").press("Enter");
  await app.getByRole("button", { name: "複製して新規作成", exact: true }).click();
  await app.getByRole("button", { name: "実施月をまとめて移動", exact: true }).click();
  await app.getByRole("dialog").getByRole("combobox", { name: "移動方向", exact: true }).selectOption("-1");
  await app.getByRole("dialog").getByRole("button", { name: "全科目行に移動を反映", exact: true }).click();
  await expect(app.getByRole("spinbutton", { name: "売上高 5月の金額", exact: true })).toHaveValue("50");
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "施策を検索", exact: true }).click();
  await app.getByRole("dialog").getByRole("searchbox").fill("季節キャンペーン"); await app.getByRole("dialog").getByRole("searchbox").press("Enter");
  await expect(app.getByRole("spinbutton", { name: "売上高 6月の金額", exact: true })).toHaveValue("50");
});
test("保存失敗時は移動後の入力を保持し、入力取消で復旧する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?scenario=save-failure"); await openTarget(app);
  const trigger = app.getByRole("button", { name: "実施月をまとめて移動", exact: true }); await trigger.click();
  await app.getByRole("dialog").getByRole("button", { name: "全科目行に移動を反映", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("自動保存できませんでした");
  await expect(app.getByRole("spinbutton", { name: "売上高 8月の金額", exact: true })).toHaveValue("75");
  await expect(trigger).toBeDisabled(); await app.getByRole("button", { name: "入力を取り消す", exact: true }).click();
  await expect(app.getByRole("spinbutton", { name: "売上高 8月の金額", exact: true })).toHaveValue("0");
  await expect(trigger).toBeEnabled();
});
