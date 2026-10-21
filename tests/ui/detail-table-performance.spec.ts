import { test, expect } from "./runtime-errors";

for (const horizontal of [true, false]) test(`2000項目の${horizontal ? "横向き" : "縦向き"}表で入力・貼付・終了と全内容を保持する`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto(`/tests/ui/detail-table-performance.html?direction=${horizontal ? "horizontal" : "vertical"}`);
  await expect(page.getByRole("heading", { name: "明細テーブル性能確認", exact: true })).toBeVisible();
  await expect(page.locator(".detail-table-value")).toHaveCount(26000);
  await page.evaluate(() => { window.detailTableMeasurement.phase = "enter"; });
  await page.getByRole("table").getByRole("columnheader").first().dblclick();
  const first = page.getByRole("textbox", { name: "項目 1の4月", exact: true });
  await expect(first).toHaveValue("0:1");
  await page.evaluate(() => { window.detailTableMeasurement.phase = "edit"; });
  await first.fill("変更した1セル");
  await expect(first).toHaveValue("変更した1セル");
  await page.evaluate(() => { window.detailTableMeasurement.phase = "paste"; });
  await first.evaluate((node, horizontal) => {
    const data = new DataTransfer(); data.setData("text/plain", horizontal ? "貼付A\t001\n貼付B\t002" : "貼付A\t貼付B\n001\t002");
    node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  }, horizontal);
  await expect(first).toHaveValue("貼付A");
  await page.evaluate(() => { window.detailTableMeasurement.phase = "finish"; });
  await first.press("Escape");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator(".detail-table-value")).toHaveCount(26000);
  const result = await page.evaluate(() => {
    const metrics = window.detailTableMeasurement;
    const errors: string[] = [];
    for (let i = 0; i < metrics.cells.length; i++) for (let c = 0; c < 13; c++) {
      const expected = i === 0 && c === 1 ? "貼付A" : i === 0 && c === 2 ? "001" : i === 1 && c === 1 ? "貼付B" : i === 1 && c === 2 ? "002" : `${i}:${c}`;
      if (metrics.cells[i]![c] !== expected) errors.push(`${i}:${c}`);
    }
    return { count: metrics.cells.length, errors, times: metrics.renders.reduce<Record<string, number>>((total, entry) => {
      total[entry.phase] = (total[entry.phase] ?? 0) + entry.duration; return total;
    }, {}) };
  });
  expect(result.count).toBe(2000); expect(result.errors).toEqual([]);
  await expect(page.getByRole("table")).toContainText("1999:12");
  console.log(`detail table ${info.project.name} ${horizontal ? "horizontal" : "vertical"}: ${JSON.stringify(result.times)}`);
  await info.attach("React描画時間", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
});
