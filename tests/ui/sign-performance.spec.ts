import { test, expect } from "./fixtures";
import { loadSignFixture, savedSalesSign } from "./master-sign-helpers";

test.describe("加減の性能観測", () => {
  test.skip(process.env.PERF_MODE !== "sign", "PERF_MODE=sign の明示実行だけで観測します。");
  for (const dataset of ["defaults", "large"]) test(`加減計測 ${dataset}`, async ({ app, page }, info) => {
    test.skip(info.project.name !== "desktop", "観測条件を desktop に揃えます。");
    test.setTimeout(120000);
    await loadSignFixture(app, page, dataset);
    const minus = app.getByRole("group", { name: "売上高の加減", exact: true }).getByRole("button", { name: "減算", exact: true });
    await expect(minus).toBeEnabled();
    const start = performance.now();
    await minus.click();
    await expect(minus).toHaveAttribute("aria-pressed", "true");
    const feedbackMs = performance.now() - start;
    await expect(minus).toBeEnabled({ timeout: 30000 });
    const savedMs = performance.now() - start;
    expect(await savedSalesSign(app)).toBe(-1);
    console.log(JSON.stringify({ mode: "sign", dataset, feedbackMs, savedMs,
      note: "Chrome開発ビルド。操作APIと状態確認の待ちを含む観測値で、性能の合否基準ではありません。" }));
  });
});
