import { expect, type FrameLocator, type Page } from "@playwright/test";
import type { PlanContents } from "../../Triadic-extension/src/core/domain/plan";

export async function openAggregationMaster(app: FrameLocator) {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const sidebar = app.getByRole("button", { name: "サイドバーを開く", exact: true });
  if (await sidebar.isVisible()) await sidebar.click();
  await app.getByRole("button", { name: "マスタ", exact: true }).click();
  await app.getByRole("button", { name: /^集計マスタ/ }).click();
  const close = app.getByRole("button", { name: "サイドバーを閉じる", exact: true }).first();
  if (await close.isVisible()) await close.click();
}

export async function loadSignFixture(app: FrameLocator, page: Page, dataset = "defaults") {
  await page.getByRole("combobox", { name: "テストデータ", exact: true }).selectOption(dataset);
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await openAggregationMaster(app);
}

export async function savedSalesSign(app: FrameLocator) {
  return app.locator("body").evaluate(async () => {
    const entry = "/Triadic-extension/src/core/storage/readPlan.ts";
    const { readPlanContents } = await import(entry);
    const [handle] = await Reflect.get(window, "showOpenFilePicker")();
    const contents: PlanContents = await readPlanContents(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
    const sales = contents.accounts.find(account => account.accountName === "売上高")!;
    return contents.aggregations.flatMap(item => item.members).find(member => member.kind === "account" && member.id === sales.id)?.sign;
  });
}
