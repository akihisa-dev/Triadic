import { selectBudgets } from "./fixtures";
import { test, expect, settleMotion } from "./fixtures";

test("ダッシュボードの比較・月別順位・詳細往復と部署の総原価表", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  const dashboard = app.getByRole("main");
  await expect(dashboard.getByRole("heading", { name: "ダッシュボード", exact: true })).toBeVisible();
  await expect(dashboard.locator(".dashboard-chart svg")).toHaveCount(2);
  for (const metric of ["売上", "利益"]) {
    const chart = dashboard.getByRole("img", { name: `${metric}の月別推移`, exact: true });
    const months = chart.locator("text").filter({ hasText: /^\d+月$/ });
    await expect(months).toHaveText(["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"]);
    for (const month of await months.all()) await expect(month).toBeVisible();
  }
  await app.locator(".dashboard-floating-trigger").click();
  await selectBudgets(app, [2]);
  await selectBudgets(app, [1, 2]);
  await app.getByRole("button", { name: "4月", exact: true }).click();
  await dashboard.getByRole("combobox", { name: "並び順の基準", exact: true }).selectOption("2");
  const source = dashboard.getByRole("button", { name: "確定予算の手修正", exact: true }).first();
  await source.click();
  await expect(app.getByRole("tab", { name: "確定予算", exact: true })).toHaveAttribute("aria-selected", "true");
  await app.getByRole("button", { name: /ダッシュボードへ戻る$/ }).click();
  await expect(app.locator(".dashboard-floating-trigger")).toContainText("4月");
  await expect(dashboard.getByRole("combobox", { name: "並び順の基準", exact: true })).toHaveValue("2");
  const department = dashboard.locator(".dashboard-department-name button").first();
  const name = await department.innerText();
  await department.click();
  await expect(app.getByRole("heading", { name: "総原価表", exact: true })).toBeVisible();
  await expect(app.getByLabel("部署名", { exact: true }).locator("option:checked")).toHaveText(name);
  await expect(app.getByRole("checkbox", { name: "前年見込を基準にした確定予算", exact: true })).toBeChecked();
  await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
  await expect(app.getByRole("heading", { name: "ダッシュボード", exact: true })).toBeVisible();
  await expect(dashboard.locator(".dashboard-chart svg")).toHaveCount(2);
});

test("サンプル予算の明暗・全件表示と空のデータ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=large");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  await expect(app.locator(".dashboard-department-name")).toHaveCount(8);
  const scatter = app.getByRole("region", { name: "業種別の売上と利益率", exact: true });
  await expect(scatter.locator(".analysis-scatter-label text")).toHaveText(["直営自動車", "自動車取扱", "不動産B"]);
  await expect(scatter.locator(".analysis-scatter-label line")).toHaveCount(0);
  const axisWidth = await scatter.locator("svg").evaluate(svg => Math.max(...[...svg.querySelectorAll(".analysis-axis line")].map(line => Number(line.getAttribute("x2")))) - 100);
  expect(axisWidth).toBe(500);


  await expect(app.locator(".dashboard-ranking")).toHaveCount(4);
  await expect(app.getByRole("button", { name: /^全\d+件を表示$|^上位5件に戻す$/ })).toHaveCount(0);
  await expect(app.getByRole("region", { name: "売上を増やす施策", exact: true }).locator(".dashboard-rank")).toHaveCount(12);
  await expect(app.getByRole("region", { name: "利益を増やす施策", exact: true }).locator(".dashboard-rank")).toHaveCount(18);
  await expect(app.getByRole("region", { name: "利益を減らす施策", exact: true }).locator(".dashboard-rank")).toHaveCount(11);
  const dark = app.getByRole("switch", { name: "ダークテーマ", exact: true });
  await dark.click();
  await expect(app.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(app.locator(".dashboard-chart svg").first()).toBeVisible();
  const overflow = await app.locator(".dashboard-page").evaluate(node => { const r = node.getBoundingClientRect(); return [...node.querySelectorAll("*")].filter(el => !el.closest(".analysis-scroll") && el.getBoundingClientRect().right > r.right + 1).map(el => `${el.tagName}.${el.getAttribute("class")}`); });
  // 図内だけのスクロールは許容し、ページ全体へのはみ出しを拒否する。
  expect(overflow).toEqual([]);
  await page.goto("/tests/ui/preview.html?data=empty");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  await expect(app.locator(".dashboard-stat strong")).toHaveText(["0", "0", "—"]);
  await expect(app.getByText("該当する施策はありません。", { exact: true })).toHaveCount(4);
});


test("追加9図の比較切替・数値・キーボードと表示条件の保持", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=large");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  for (const name of ["展開別の利益増減", "期間別の月別利益増減", "展開区分別の利益増減", "業種別の売上構成", "業種別の売上と利益率", "部署 × 業種の利益", "勘定科目別の費用構成", "科目別の費用増減", "展開 × 月別の利益増減"]) await expect(app.getByRole("heading", { name, exact: true })).toBeVisible();
  const waterfall = app.locator(".dashboard-analysis-section").filter({ has: app.getByRole("heading", { name: "展開別の利益増減", exact: true }) });
  await expect(app.getByText("数値を表示", { exact: true })).toHaveCount(0);
  await expect(waterfall.locator("g[data-value]").first()).toHaveAttribute("aria-label", /618,470/);
  await expect(waterfall.locator("g[data-value]").last()).toHaveAttribute("aria-label", /833,696/);
  const mark = waterfall.locator("g[data-value]").first();
  await mark.focus();
  await expect(waterfall.locator("output")).toContainText("618,470");
  await app.locator(".dashboard-floating-trigger").click();
  await selectBudgets(app, [1, 2]);
  await app.getByRole("combobox", { name: "構成・増減グラフの予算", exact: true }).selectOption("2");
  await app.getByRole("combobox", { name: "展開", exact: true }).selectOption({ label: "料金改定" });
  await app.getByRole("button", { name: "4月", exact: true }).click();
  await expect(waterfall.locator(".analysis-context")).toContainText("確定予算");
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  await expect(app.getByRole("combobox", { name: "構成・増減グラフの予算", exact: true })).toHaveValue("2");
  await expect(app.getByRole("combobox", { name: "展開", exact: true }).locator("option:checked")).toHaveText("料金改定");
  await expect(app.locator(".dashboard-floating-trigger")).toContainText("4月");
});

test("負数・ゼロ・未所属・長い名称でも図と入力の意味を保持する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/ui/dashboard-analysis.html?mode=negative");
  await expect(page.getByText("負の金額を含むため、符号付きの棒グラフで表示します。", { exact: true })).toHaveCount(2);
  const matrix = page.locator(".analysis-heatmap").first();
  await expect(matrix.getByRole("row").last()).toContainText("未所属");
  await page.getByRole("combobox", { name: "構成・増減グラフの予算", exact: true }).selectOption("2");
  await expect(page.getByText("負の金額を含むため、符号付きの棒グラフで表示します。", { exact: true })).toHaveCount(1);
  await page.goto("/tests/ui/dashboard-analysis.html?mode=zero");
  await expect(page.getByText("金額はすべて0です。構成比は算出しません。", { exact: true })).toHaveCount(2);
  await page.goto("/tests/ui/dashboard-analysis.html?mode=long");
  await expect(page.getByRole("heading", { name: "展開 × 月別の利益増減", exact: true })).toBeVisible();
  expect(await page.locator(".dashboard-page").evaluate(node => { const edge = node.getBoundingClientRect().right; return [...node.querySelectorAll("*")].filter(el => !el.closest(".analysis-scroll") && el.getBoundingClientRect().right > edge + 1).map(el => `${el.tagName}.${el.className}`); })).toEqual([]);
  expect(errors).toEqual([]);
});


test("費用の2図は全幅で上下に並び、構成図に横スクロールを作らない", async ({ page, app }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tests/ui/preview.html?data=large");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  const charts = app.locator(".dashboard-expense-charts");
  const sections = charts.locator(".dashboard-analysis-section");
  await expect(sections).toHaveCount(2);
  await settleMotion(app.locator("body"));
  const boxes = await sections.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, bottom: r.bottom }; }));
  expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.bottom);
  expect(boxes[0]!.width).toBeGreaterThan(1000);
  const available = await app.locator(".dashboard-grid").evaluate(node => node.getBoundingClientRect().width) - 50;
  expect(Math.abs(boxes[0]!.width - available)).toBeLessThanOrEqual(1);
  expect(boxes[1]!.width).toBe(boxes[0]!.width);
  const scroll = sections.first().locator(".analysis-plot > .analysis-scroll");
  await expect.poll(() => scroll.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect(sections.first().locator(".analysis-tile-label")).toContainText(["給料手当", "下払運賃", "賃借料", "臨時傭員費"]);
  await sections.first().screenshot({ path: "/tmp/triadic-dashboard-expenses.png" });
});


test("散布図は業種名を直接結び、同じ位置の点と長い名称でも照合番号を使わない", async ({ page }) => {
  await page.goto("/tests/ui/dashboard-analysis.html?mode=scatter-labels");
  const section = page.getByRole("region", { name: "業種別の売上と利益率", exact: true });
  const labels = section.locator(".analysis-scatter-label");
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const dark of [false, true]) {
      await page.evaluate(dark => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, dark);
      for (const single of [true, false]) {
        if (await page.locator(".dashboard-floating-trigger").getAttribute("aria-expanded") !== "true") await page.locator(".dashboard-floating-trigger").click();
        if (single) await page.getByRole("checkbox", { name: "前年見込を基準にした確定予算", exact: true }).uncheck();
        else await page.getByRole("checkbox", { name: "前年見込を基準にした確定予算", exact: true }).check();
        await expect(labels.locator("text").first()).toContainText("同じ位置に重なる長い業種名");
        await expect(section.locator(".analysis-legend")).toHaveCount(1);
        const geometry = await labels.evaluateAll(nodes => nodes.map(node => {
          const text = node.querySelector("text")!, svg = text.ownerSVGElement!, box = text.getBBox();
          return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height, inside: box.x >= 0 && box.y >= 0 && box.x + box.width <= svg.viewBox.baseVal.width && box.y + box.height <= svg.viewBox.baseVal.height };
        }));
        expect(geometry.length).toBeGreaterThan(1);
        for (const [i, box] of geometry.entries()) {
          expect(box.inside).toBe(true);
          for (const other of geometry.slice(0, i)) expect(box.left >= other.right || box.right <= other.left || box.top >= other.bottom || box.bottom <= other.top).toBe(true);
        }
      }
    }
  }
});


test("表示条件はスクロール中も画面内に残り、月変更と解除で年間指標・全部署を維持する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=large");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "ダッシュボード", exact: true }).click();
  const trigger = app.locator(".dashboard-floating-trigger");
  await expect(app.locator(".dashboard-pin-control, .dashboard-drag-handle")).toHaveCount(0);
  const annual = ["12,702,061", "833,696", "6.6%"];
  const department = app.locator(".dashboard-department").nth(1).locator(".dashboard-number").first();
  await expect(department).toHaveText("5,286,436");
  await trigger.press("Enter");
  await app.getByRole("button", { name: "6月", exact: true }).click();
  await expect(department).not.toHaveText("5,286,436");
  await expect(app.locator(".dashboard-stat strong")).toHaveText(annual);
  await expect(app.locator(".dashboard-department-name")).toHaveCount(8);
  await trigger.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await app.locator(".home-content").evaluate(node => { node.scrollTop = node.scrollHeight; });
  const inside = await app.locator(".dashboard-floating-controls").evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
  expect(inside).toBe(true);
  await expect(app.getByRole("button", { name: "年間に戻す", exact: true })).toHaveCount(0);
  await trigger.press("Enter");
  await app.getByRole("button", { name: "年間", exact: true }).click();
  await expect(trigger).toContainText("年間");
  await expect(department).toHaveText("5,286,436");
  await expect(app.locator(".dashboard-stat strong")).toHaveText(annual);
  await expect(app.locator(".analysis-values, .slice-selects, .slice-summary")).toHaveCount(0);
});
