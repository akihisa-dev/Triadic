import { test, expect } from "@playwright/test";
test("選択時の再集計と操作完了時間を開発・製品ビルドで比較する", async ({ page }) => {
  test.skip(!process.env.GRID_MEASURE_DIR, "明示した性能測定だけで実行します");
  test.setTimeout(120000);
  for (const environment of ["development", "production"]) for (const count of [10,100,500]) for (const version of ["before", "after"]) {
    await page.goto(`${process.env.GRID_MEASURE_DIR}/${environment}-${version}.html?mode=initiative&count=${count}&rows=${count}&traceTotals=1`);
    const cell = page.locator('input[data-row="0"][data-column="0"]');
    await expect(cell).toBeVisible(); await cell.focus();
    const trials = [];
    for (let trial=0; trial<6; trial++) {
      const before = await page.evaluate(() => ({ time: performance.now(), index: (window as unknown as {aggregateMetrics:{ms:number}[]}).aggregateMetrics.length, ...((window as unknown as {gridRenderMetrics:{renders:number;commits:number}}).gridRenderMetrics) }));
      await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowLeft");
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const result = await page.evaluate(index => ({ elapsed: performance.now(), aggregate: (window as unknown as {aggregateMetrics:{ms:number}[]}).aggregateMetrics.slice(index), ...((window as unknown as {gridRenderMetrics:{renders:number;commits:number}}).gridRenderMetrics) }), before.index);
      if (version === "after") expect(result.aggregate).toHaveLength(0);
      else expect(result.aggregate.length).toBeGreaterThan(0);
      if (trial) trials.push({ keyPresses: 2, renders: result.renders-before.renders, commits: result.commits-before.commits, interactionMs: result.elapsed-before.time, calls: result.aggregate.length, aggregateMs: result.aggregate.reduce((sum,item)=>sum+item.ms,0) });
    }
    console.log("GRID_SELECTION "+JSON.stringify({ environment, count, version, browser: await page.evaluate(()=>navigator.userAgent), trials }));
  }
});
