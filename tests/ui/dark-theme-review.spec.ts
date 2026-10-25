import { test, expect, settleMotion, selectClassification } from "./fixtures";

async function openSample(page: import("@playwright/test").Page, app: import("@playwright/test").FrameLocator) {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
}

test("表示幅が足りない表は施策名と金額を同時に読め、広い表は4列固定を保つ", async ({ page, app }) => {
  await openSample(page, app);
  for (const name of ["施策一覧", "展開表"]) {
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name, exact: true }).click();
    await expect(app.getByRole("heading", { name, exact: true })).toBeVisible();
    const menu = app.locator(".home-header").getByRole("button", { name: /サイドバー/ });
    if (await menu.getAttribute("aria-expanded") === "true") await menu.click();
    await page.mouse.move(page.viewportSize()!.width - 5, 10);
    const table = app.getByRole("table", { name, exact: true });
    const region = table.locator("..");
    const row = table.getByRole("row").filter({ has: app.getByRole("button", { name: "既存商品の販売拡大", exact: true }) });
    const title = row.getByRole("rowheader").filter({ has: app.getByRole("button", { name: "既存商品の販売拡大", exact: true }) });
    const amount = row.locator("td:not(.expansion-category):not(.initiative-list-fixed)").first();
    const original = await amount.textContent();
    for (const width of [320, 375, 600, 900, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await settleMotion(app.locator("body"));
      if (await menu.getAttribute("aria-expanded") === "true") await menu.click();
      await page.mouse.move(width - 5, 10);
      await settleMotion(app.locator("body"));
      await title.scrollIntoViewIfNeeded();
      await region.evaluate((node, name) => {
        const button = [...node.querySelectorAll("tbody button")].find(button => button.textContent?.trim() === name)!;
        const row = button.closest("tr")!.getBoundingClientRect();
        const headerBottom = node.querySelector("thead")!.getBoundingClientRect().bottom;
        const viewportBottom = node.getBoundingClientRect().top + node.clientHeight;
        node.scrollTop += row.top + row.height / 2 - (headerBottom + viewportBottom) / 2;
      }, "既存商品の販売拡大");
      await region.evaluate(node => { node.scrollLeft = 0; });
      const available = await region.evaluate(node => node.clientWidth);
      if (available <= 650) {
        // Scroll the classifications away, keeping one full amount beside the name.
        const amountBox = (await amount.boundingBox())!;
        const titleBox = (await title.boundingBox())!;
        const regionBox = (await region.boundingBox())!;
        await region.evaluate((node, offset) => { node.scrollLeft = offset; }, amountBox.x - regionBox.x - titleBox.width);
        const shownName = (await title.boundingBox())!;
        const shownAmount = (await amount.boundingBox())!;
        expect(Math.abs(shownName.x - regionBox.x)).toBeLessThanOrEqual(1);
        expect(shownAmount.x).toBeGreaterThanOrEqual(shownName.x + shownName.width - 1);
        expect(shownAmount.x + shownAmount.width).toBeLessThanOrEqual(regionBox.x + available + 1);
        expect(await title.evaluate(node => {
          const r = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
        // Check painted visibility, not merely a rectangle hidden below a sticky cell.
        expect(await amount.evaluate(node => {
          const r = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
      } else {
        const columns = name === "施策一覧" ? table.locator("thead .initiative-list-fixed") : table.locator("thead tr").first().locator("th").filter({ hasNot: table.locator("[data-table-period]") });
        const fixed = (await columns.all()).slice(0, 4);
        expect(fixed).toHaveLength(4);
        const before = await Promise.all(fixed.map(column => column.boundingBox()));
        await region.evaluate(node => { node.scrollLeft = 400; });
        for (const [index, column] of fixed.entries()) expect(Math.abs((await column.boundingBox())!.x - before[index]!.x)).toBeLessThanOrEqual(1);
      }
      await expect(amount).toHaveText(original!);
    }
  }
});

for (const surface of ["initiative", "previous"]) {
  test(`${surface}の選択月は明暗両方で読め、セル寸法と金額を保つ`, async ({ page, app }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await openSample(page, app);
    const nav = app.getByRole("navigation", { name: "メインナビゲーション" });
    if (surface === "initiative") {
      await nav.getByRole("button", { name: "施策一覧", exact: true }).click();
      await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
    } else {
      await nav.getByRole("button", { name: "前年入力", exact: true }).click();
      await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
      await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
    }
    const cell = app.locator('input[data-row="0"][data-column="0"]');
    const before = await cell.boundingBox();
    const original = await cell.inputValue();
    await cell.click();
    const selected = app.locator("th.grid-month-selected");
    await expect(selected).toHaveText("4月");
    await expect(selected).toHaveCSS("background-color", "rgb(163, 163, 163)");
    await expect(selected).toHaveCSS("color", "rgb(32, 32, 32)");
    await app.getByRole("switch", { name: "ダークテーマ" }).check();
    await cell.click();
    await expect(selected).toHaveCSS("background-color", "rgb(64, 64, 64)");
    await expect(selected).toHaveCSS("color", "rgb(237, 237, 237)");
    expect((await cell.boundingBox())!.width).toBe(before!.width);
    expect((await cell.boundingBox())!.height).toBe(before!.height);
    await expect(cell).toHaveValue(original);
  });
}

test("集計追加の両入力欄は明暗両方で通常枠と青い選択枠を揃える", async ({ page, app }) => {
  await openSample(page, app);
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "マスタ", exact: true }).click();
  await app.getByRole("button", { name: /^集計マスタ/ }).click();
  await app.getByRole("button", { name: "＋ 集計を追加", exact: true }).click();
  const form = app.getByRole("form", { name: "集計の新規登録" });
  for (const dark of [false, true]) {
    await app.getByRole("switch", { name: "ダークテーマ" }).setChecked(dark);
    for (const label of ["集計名", "表示名"]) {
      const input = form.getByRole("textbox", { name: label, exact: true });
      await app.getByRole("heading", { name: "集計マスタ", exact: true }).click();
      await expect(input).toHaveCSS("border-color", dark ? "rgb(72, 72, 72)" : "rgb(217, 217, 217)");
      await input.click();
      await expect(input).toHaveCSS("border-style", "solid");
      for (const property of ["border-color", "outline-color", "caret-color"]) await expect(input).toHaveCSS(property, dark ? "rgb(128, 153, 255)" : "rgb(0, 51, 255)");
      await app.getByRole("heading", { name: "集計マスタ", exact: true }).click();
      await expect(input).toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
    }
  }
});
