import { test, expect, settleMotion } from "./fixtures";
import type { FrameLocator } from "@playwright/test";

async function openDetails(app: FrameLocator) {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "明細", exact: true }).click();
}
async function addDetail(app: FrameLocator, name: string, description = "") {
  await app.getByRole("button", { name: "＋ 明細を追加", exact: true }).click();
  const dialog = app.getByRole("dialog", { name: "明細を追加", exact: true });
  await dialog.getByRole("textbox", { name: "明細名", exact: true }).fill(name);
  await dialog.getByRole("textbox", { name: "短い説明", exact: true }).fill(description);
  await dialog.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(app.getByRole("heading", { name: name.trim(), exact: true })).toBeVisible();
}

test("明細は展開表の直下にあり、カードから各編集画面を開き履歴でも復元する", async ({ app, page }, testInfo) => {
  await openDetails(app);
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  const labels = await menu.getByRole("button").allTextContents();
  const expansion = labels.indexOf("展開表");
  expect(expansion).toBeGreaterThan(-1);
  expect(labels.slice(expansion, expansion + 3)).toEqual(["展開表", "明細", "前年入力"]);
  await expect(app.locator(".details-card")).toHaveCount(0);
  for (const name of ["人件費", "設備費", "外注費", "広告費", "旅費", "賃借料"]) {
    await addDetail(app, `${name}の算定`, `${name}の根拠を確認`);
    await expect(app.getByRole("main").locator("input, textarea, table")).toHaveCount(0);
    await app.getByRole("button", { name: "一覧に戻る", exact: true }).click();
  }
  await expect(app.locator(".details-card")).toHaveCount(6);
  await expect(app.locator(".details-card").first()).toContainText("人件費の根拠を確認");
  await settleMotion(app.locator("body"));
  expect(await app.locator(".home-content").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/triadichrome-details-cards-${testInfo.project.name}.png` });
  await app.getByRole("button", { name: "人件費の算定を開く", exact: true }).click();
  await expect(app.getByRole("heading", { name: "人件費の算定", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "明細", exact: true })).toHaveAttribute("aria-current", "page");
  const back = app.getByRole("button", { name: "前の画面に戻る", exact: true });
  const forward = app.getByRole("button", { name: "次の画面に進む", exact: true });
  await back.click();
  await expect(app.locator(".details-card")).toHaveCount(6);
  await forward.click();
  await expect(app.getByRole("heading", { name: "人件費の算定", exact: true })).toBeVisible();
  await back.click();
  await back.click();
  await expect(app.getByRole("heading", { name: "賃借料の算定", exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "前年入力", exact: true }).click();
  await expect(app.getByRole("heading", { name: "前年入力", exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "明細", exact: true }).click();
  await expect(app.locator(".details-card")).toHaveCount(6);
});

test("小窓は必須名・取消・Esc・変換中Enterを扱い、保存せずカードを追加する", async ({ app, page }, testInfo) => {
  await page.goto("/tests/ui/preview.html?data=empty&scenario=save-failure");
  await openDetails(app);
  const add = app.getByRole("button", { name: "＋ 明細を追加", exact: true });
  await add.click();
  const dialog = app.getByRole("dialog", { name: "明細を追加", exact: true });
  const name = dialog.getByRole("textbox", { name: "明細名", exact: true });
  const next = dialog.getByRole("button", { name: "次へ", exact: true });
  await expect(name).toBeFocused();
  await expect(next).toBeDisabled();
  await name.fill("   ");
  await expect(next).toBeDisabled();
  await name.fill("取り消す明細");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(add).toBeFocused();
  await expect(app.locator(".details-card")).toHaveCount(0);
  await add.click();
  await expect(name).toHaveValue("");
  await name.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await name.fill("  名称のみ  ");
  await name.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(dialog).toBeVisible();
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadichrome-detail-create-${testInfo.project.name}.png` });
  await next.click();
  await expect(app.getByRole("heading", { name: "名称のみ", exact: true })).toBeVisible();
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "一覧に戻る", exact: true }).click();
  await expect(app.getByRole("button", { name: "名称のみを開く", exact: true })).toBeVisible();
});

test("カードはファイルを閉じて開き直すと破棄される", async ({ app }) => {
  await openDetails(app);
  await addDetail(app, "画面内だけの明細", "保存対象外");
  await app.getByRole("button", { name: "閉じる", exact: true }).click();
  await app.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await openDetails(app);
  await expect(app.locator(".details-card")).toHaveCount(0);
});
