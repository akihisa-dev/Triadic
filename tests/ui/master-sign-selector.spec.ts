import { test, expect, settleMotion } from "./fixtures";
import type { Locator } from "@playwright/test";
import { loadSignFixture, openAggregationMaster, savedSalesSign } from "./master-sign-helpers";

async function aligned(group: Locator) {
  await settleMotion(group);
  const boxes = await group.evaluate(element => {
    const active = element.querySelector('button[aria-pressed="true"]')!.getBoundingClientRect();
    const pill = element.querySelector(".pill")!.getBoundingClientRect();
    return { left: pill.left - active.left, width: pill.width - active.width };
  });
  expect(boxes.left).toBeCloseTo(0, 0);expect(boxes.width).toBeCloseTo(0, 0);
}

test("加減のボタンと左右キーで選択を保存し、背景が選択側に揃う", async ({app,page}) => {
  await loadSignFixture(app,page);
  const group=app.getByRole("group",{name:"売上高の加減",exact:true});
  const plus=group.getByRole("button",{name:"加算",exact:true}), minus=group.getByRole("button",{name:"減算",exact:true});
  await expect(plus).toHaveAttribute("aria-pressed","true");await aligned(group);
  await minus.click();await expect(minus).toHaveAttribute("aria-pressed","true");await expect(minus).toBeEnabled();await aligned(group);
  await minus.press("ArrowLeft");await expect(plus).toHaveAttribute("aria-pressed","true");await expect(plus).toBeFocused();await expect(plus).toBeEnabled();await aligned(group);
  await page.emulateMedia({reducedMotion:"reduce"});
  await plus.press("ArrowRight");await expect(minus).toHaveAttribute("aria-pressed","true");await expect(minus).toBeEnabled();await aligned(group);
  await app.getByRole("button",{name:"閉じる",exact:true}).click();
  await app.getByRole("alertdialog",{name:"閉じる",exact:true}).getByRole("button",{name:"閉じる",exact:true}).click();
  await openAggregationMaster(app);
  await expect(minus).toHaveAttribute("aria-pressed","true");await aligned(group);
});

test("加減の保存失敗では選択と背景を元の符号に保つ", async ({app,page}) => {
  await page.getByRole("combobox",{name:"ファイル操作",exact:true}).selectOption("save-failure");
  await loadSignFixture(app,page);
  const group=app.getByRole("group",{name:"売上高の加減",exact:true});
  await group.getByRole("button",{name:"減算",exact:true}).click();
  await expect(app.getByRole("alert")).toHaveText("テスト用の保存失敗です。");
  await expect(group.getByRole("button",{name:"加算",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(group.getByRole("button",{name:"減算",exact:true})).toHaveAttribute("aria-pressed","false");await aligned(group);
  await expect(group.getByRole("button",{name:"加算",exact:true})).toBeEnabled();
  await expect(group.getByRole("button",{name:"減算",exact:true})).toBeEnabled();
  expect(await savedSalesSign(app)).toBe(1);
});

for (const dataset of ["defaults", "large"]) test(`加減は保存完了前に反映され、保存中の再操作を止める ${dataset}`, async ({ app, page }) => {
  await loadSignFixture(app, page, dataset);
  const group = app.getByRole("group", { name: "売上高の加減", exact: true });
  const plus = group.getByRole("button", { name: "加算", exact: true });
  const minus = group.getByRole("button", { name: "減算", exact: true });
  await page.evaluate(async () => {
    const entry = "/tests/ui/preview.ts";
    (await import(entry)).memoryFiles.holdNextWrite();
  });
  try {
    await minus.click();
    await expect.poll(() => page.evaluate(async () => {
      const entry = "/tests/ui/preview.ts";
      return (await import(entry)).memoryFiles.isWritePending();
    })).toBe(true);
    await expect(minus).toHaveAttribute("aria-pressed", "true");
    await expect(plus).toBeDisabled();
    await expect(minus).toBeDisabled();
    expect(await savedSalesSign(app)).toBe(1);
  } finally {
    await page.evaluate(async () => {
      const entry = "/tests/ui/preview.ts";
      (await import(entry)).memoryFiles.releaseWrite();
    });
  }
  await expect(minus).toBeEnabled();
  await expect(minus).toHaveAttribute("aria-pressed", "true");
  expect(await savedSalesSign(app)).toBe(-1);
});
