import { test, expect } from "./fixtures";
import { mechanisms } from "../../Triadic-extension/src/extension/mechanismModel";

test("仕組みの全対象を閲覧し、条件・保存範囲を確認して業務の関連図へ戻る", async ({ app, page }) => {
  test.setTimeout(90_000);
  await page.goto("/tests/ui/preview.html?data=full");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  for (const [kind, label] of [["calculation", "計算の仕組み"], ["process", "処理の流れ"]] as const) {
    await app.getByRole("button", { name: label, exact: true }).press("Enter");
    const view = app.getByRole("region", { name: label, exact: true });
    for (const topic of mechanisms.filter(topic => topic.kind === kind)) {
      await view.getByRole("navigation").getByRole("button", { name: topic.name, exact: true }).click();
      await expect(view.getByRole("heading", { name: topic.name, exact: true })).toBeVisible();
      await expect(view.getByRole("list", { name: `${topic.name}の流れ` })).toBeVisible();
      await expect(view.locator(".mechanism-content header p")).toHaveText(topic.purpose);
      await expect(view.locator(".mechanism-overview li")).toHaveText(topic.steps.map(step => step.name));
      await expect(view.locator(".mechanism-inputs li")).toHaveText(topic.inputs);
      await expect(view.locator(".mechanism-flow h3")).toHaveText(topic.steps.map(step => step.name));
      await expect(view.locator(".mechanism-flow p")).toHaveText(topic.steps.map(step => step.detail));
      await expect(view.locator(".mechanism-outcomes li")).toHaveText(topic.conditions);
      await view.getByText("説明に対応する実装", { exact: true }).click();
      await expect(view.locator(".mechanism-sources code")).toHaveText(topic.sources.map(source => source.replace("Triadic-extension/src/", "src/")));
      await expect(view).toContainText(topic.result);
      await expect(view).toContainText(topic.retention);
      await expect(view.getByRole("heading", { name: "条件と例外", exact: true })).toBeVisible();
      expect(await view.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await expect(view.locator(".mechanism-sources ul")).toBeVisible();
    await expect(view).not.toContainText("既存商品の販売拡大");
  }
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "画面とデータ", exact: true }).click();
  await expect(app.getByRole("region", { name: "画面とデータの対応図" })).toBeVisible();
  await app.getByRole("button", { name: "関連図", exact: true }).click();
  await expect(app.getByRole("region", { name: "画面とマスタの相関図" })).toBeVisible();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "履歴", exact: true }).click();
  await expect(app.locator(".history-date")).toHaveCount(3);
});

test("保存場所の説明が作成識別子・共通順・独自表示名の現在の保存先を示す", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "処理の流れ", exact: true }).click();
  const view = app.getByRole("region", { name: "処理の流れ", exact: true });
  await view.getByRole("button", { name: "保存場所とデータの寿命", exact: true }).click();
  const flow = view.getByRole("list", { name: "保存場所とデータの寿命の流れ" });
  for (const text of ["各行のidentity", "必須・一意", "識別子の欠落や旧形式は補完せず拒否", "master_order", "accounts.display_name", "表示名がNULLの場合は正式名", "triadic_metadataには保存形式の識別情報"]) {
    await expect(flow).toContainText(text);
  }
  await expect(flow).not.toContainText("既存分類は識別子未登録として引き続き利用できます");
  await expect(flow).not.toContainText("共通順と科目の独自表示名もtriadic_metadata");
});
