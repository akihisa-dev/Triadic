import { test, expect, settleMotion, selectClassification } from "./fixtures";

test("展開表の結合セル・固定列・全月の列境界をスクロール後も保つ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("main", { name: "ホーム", exact: true }).getByRole("button", { name: "展開表", exact: true }).click();
  await app.getByRole("main", { name: "ホーム", exact: true }).getByRole("button", { name: "展開表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
  await settleMotion(app.locator("body"));
  const region = app.getByRole("region", { name: "展開表の月別種別・比較", exact: true });
  const inspect = () => region.evaluate(node => {
    const table = node.querySelector("table")!;
    const rect = (element: Element) => element.getBoundingClientRect();
    const headers = table.querySelectorAll("thead tr:first-child th");
    const fixedHeaders = [...headers].slice(0, 4);
    const [group, period, category, name] = fixedHeaders.map(rect);
    const tableRight = rect(table).right;
    const monthHeaders = [...headers].slice(4);
    const rows = [...table.querySelectorAll("tbody tr")].map(row => {
      const categoryCell = row.querySelector("td.expansion-category");
      const amounts = [...row.querySelectorAll("td:not(.expansion-category)")];
      const subtotal = row.querySelector<HTMLTableCellElement>(".expansion-subtotal-name");
      return {
        kind: subtotal ? "subtotal" : categoryCell ? "category-start" : "category-continuation",
        amountCount: amounts.length,
        cellCount: row.querySelectorAll("td").length,
        mismatch: amounts.length !== 114 || monthHeaders.some((header, index) => {
          const start = rect(amounts[index * 6]!); const end = rect(amounts[index * 6 + 5]!);
          return Math.abs(rect(header).left - start.left) > 1 || Math.abs(rect(header).right - end.right) > 1;
        }),
        subtotalMismatch: subtotal !== null && (subtotal.colSpan !== 3 ||
          Math.abs(rect(subtotal).left - Math.min(period!.left, tableRight - rect(subtotal).width)) > 1 ||
          Math.abs(rect(subtotal).width - period!.width - category!.width - name!.width) > 1),
      };
    });
    const summaries = [...table.querySelectorAll<HTMLTableCellElement>(".expansion-summary")];
    return { labels: fixedHeaders.map(header => header.textContent), periods: monthHeaders.length,
      // Sticky cells stop at the table's right edge. On narrow screens the four
      // fixed columns exceed the viewport, so the last cells reach that edge first.
      fixedOffsets: [period, category, name].map((bounds, index) => {
        const offset = fixedHeaders.slice(0, index + 1).reduce((width, header) => width + rect(header).width, 0);
        return bounds!.left - Math.min(group!.left + offset, tableRight - bounds!.width);
      }),
      summaryMismatch: summaries.some(cell => cell.colSpan !== 4 || Math.abs(rect(cell).width - group!.width - period!.width - category!.width - name!.width) > 1),
      fixedMismatch: ["expansion-group", "expansion-period", "expansion-category", "expansion-name"].some((className, index) =>
        [...table.querySelectorAll(`tbody .${className}`)].some(cell => Math.abs(rect(cell).left - rect(fixedHeaders[index]!).left) > 1)),
      rows,
      bottom: rect(node).bottom, viewport: window.innerHeight,
      horizontal: node.scrollWidth > node.clientWidth,
      outside: document.documentElement.scrollWidth > window.innerWidth,
      lastRight: rect(table.querySelector("tbody tr td:last-child")!).right, regionRight: rect(node).right };
  });
  const check = async () => {
    const layout = await inspect();
    expect(layout.labels).toEqual(["展開名", "期間名", "展開区分", "施策名"]);
    expect(layout.periods).toBe(19);
    for (const offset of layout.fixedOffsets) expect(Math.abs(offset)).toBeLessThan(1);
    expect(layout.summaryMismatch).toBe(false);
    expect(layout.fixedMismatch).toBe(false);
    expect(new Set(layout.rows.map(row => row.kind))).toEqual(new Set(["category-start", "category-continuation", "subtotal"]));
    for (const row of layout.rows) {
      expect(row.amountCount).toBe(114);
      expect(row.cellCount).toBe(row.kind === "category-start" ? 115 : 114);
      expect(row.mismatch).toBe(false);
      expect(row.subtotalMismatch).toBe(false);
    }
    expect(layout.bottom).toBeLessThanOrEqual(layout.viewport);
    expect(layout.outside).toBe(false);
    expect(layout.horizontal).toBe(true);
  };
  await check();
  // Stress cell contents without changing the saved plan or production sample.
  await region.evaluate(node => {
    node.querySelector(".initiative-name-button")!.textContent = "長い施策名".repeat(60);
    node.querySelector("tbody td:not(.expansion-category)")!.textContent = "-9,007,199,254,741";
  });
  await check();
  const overflow = await region.evaluate(node => {
    const amount = node.querySelector("tbody td:not(.expansion-category)")!;
    const name = node.querySelector(".initiative-name-button")!;
    return { amountClipped: getComputedStyle(amount).overflow === "hidden",
      nameFits: name.getBoundingClientRect().width <= name.parentElement!.getBoundingClientRect().width };
  });
  expect(overflow.amountClipped).toBe(true);
  expect(overflow.nameFits).toBe(true);
  await region.evaluate(node => { node.scrollLeft = 350; });
  await check();
  await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  await check();
  const end = await inspect();
  expect(end.lastRight).toBeLessThanOrEqual(end.regionRight + 1);
  await region.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await check();
  const bottom = await region.evaluate(node => ({
    moved: node.scrollTop > 0,
    lastRowBottom: node.querySelector("tbody:last-child tr:last-child")!.getBoundingClientRect().bottom,
    regionBottom: node.getBoundingClientRect().bottom,
  }));
  expect(bottom.moved).toBe(true);
  expect(bottom.lastRowBottom).toBeLessThanOrEqual(bottom.regionBottom + 1);
  await region.evaluate(node => { node.scrollLeft = 0; node.scrollTop = 0; });
  const initiative = region.locator(".initiative-name-button").first();
  await initiative.click();
  await expect(app.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue("設備更新と償却費の見直し");
});

test("施策がない展開も名称とゼロの小計を同じ列で表示する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=defaults");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("main", { name: "ホーム", exact: true }).getByRole("button", { name: "展開表", exact: true }).click();
  await app.getByRole("main", { name: "ホーム", exact: true }).getByRole("button", { name: "展開表", exact: true }).click();
  await selectClassification(app.getByRole("spinbutton", { name: "比較対象2", exact: true }), "確定予算");
  await settleMotion(app.locator("body"));
  const rows = app.locator(".expansion-table .expansion-subtotal");
  await expect(rows).toHaveCount(8);
  await expect(rows.locator(".expansion-group")).toHaveText(["コスト", "料金改定", "荷主撤退", "物量増減", "売上拡販", "拠点集約", "生産性向上", "効率化"]);
  await expect(rows.locator(".expansion-subtotal-name")).toHaveText(["コスト計", "料金改定計", "荷主撤退計", "物量増減計", "売上拡販計", "拠点集約計", "生産性向上計", "効率化計"]);
  for (const row of await rows.all()) {
    await expect(row.locator("th")).toHaveCount(2);
    await expect(row.locator(".expansion-subtotal-name")).toHaveAttribute("colspan", "3");
    await expect(row.locator(".expansion-category")).toHaveCount(0);
    await expect(row.locator("td")).toHaveCount(114);
    expect((await row.locator("td").allTextContents()).every(value => value === "")).toBe(true);
    const aligned = await row.evaluate(node => {
      const headers = [...node.closest("table")!.querySelectorAll("thead tr:first-child th")];
      const labels = headers.slice(1, 4).map(cell => cell.getBoundingClientRect());
      const subtotal = node.querySelector(".expansion-subtotal-name")!.getBoundingClientRect();
      const amounts = [...node.querySelectorAll("td:not(.expansion-category)")];
      return Math.abs(subtotal.left - labels[0]!.left) <= 1 &&
        Math.abs(subtotal.width - labels.reduce((width, label) => width + label.width, 0)) <= 1 &&
        headers.slice(4).every((header, index) => {
          const bounds = header.getBoundingClientRect();
          return Math.abs(bounds.left - amounts[index * 6]!.getBoundingClientRect().left) <= 1 &&
            Math.abs(bounds.right - amounts[index * 6 + 5]!.getBoundingClientRect().right) <= 1;
        });
    });
    expect(aligned).toBe(true);
  }
});
