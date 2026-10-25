import { selectAccount, openInitiativeEntry, test, expect, settleMotion } from "./fixtures";

test("施策の月別入力を罫線付きのコンパクトな表で表示する", async ({ page, app }) => {
  await page.getByLabel("テストデータ", { exact: true }).selectOption("defaults");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await openInitiativeEntry(app);
  await app.getByRole("heading", { name: "施策入力", exact: true }).click();
  await settleMotion(app.locator("body"));
  const table = app.getByRole("table", { name: "月別金額", exact: true });
  await expect(table.getByRole("columnheader")).toHaveCount(13);
  const row = table.locator("tbody tr").first();
  const layout = await row.evaluate(element => {
    const cell = element.querySelector("td")!;
    const select = element.querySelector('[role="combobox"]')!;
    const remove = element.querySelector(".initiative-row-delete")!;
    return {
      border: getComputedStyle(cell).borderRightWidth,
      bottom: getComputedStyle(cell).borderBottomWidth,
      height: element.getBoundingClientRect().height,
      aligned: Math.abs(select.getBoundingClientRect().top - remove.getBoundingClientRect().top) < 2,
    };
  });
  expect(layout.border).toBe("1px");
  expect(layout.bottom).toBe("1px");
  expect(layout.height).toBeLessThan(50);
  expect(layout.aligned).toBe(true);
  await table.getByRole("combobox", { name: "1行目の勘定科目", exact: true }).focus();
  await selectAccount(table.getByRole("combobox", { name: "1行目の勘定科目", exact: true }), { label: "売上高" });
  const amount = table.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true });
  await amount.fill("123.456");
  await expect(amount).toHaveValue("123.456");
  await expect(app.getByRole("button", { name: "1行目を削除", exact: true })).toBeEnabled();
});

test("狭い画面でも長い科目名をコードなしで全文表示し、最後の月を編集できる", async ({ page, app }) => {
  await page.getByLabel("テストデータ", { exact: true }).selectOption("defaults");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await openInitiativeEntry(app);
  const table = app.getByRole("table", { name: "月別金額", exact: true });
  const select = table.getByRole("combobox", { name: "1行目の勘定科目", exact: true });
  await select.focus();
  await select.fill("減価");
  await expect(app.getByRole("listbox").getByRole("option")).toHaveText(["固定資産減価償却費"]);
  await settleMotion(app.locator("body"));
  await page.screenshot({ path: `/tmp/triadic-account-field-${page.viewportSize()!.width}.png` });
  await selectAccount(select, { label: "固定資産減価償却費" });
  await app.getByRole("button", { name: "＋ 勘定科目を追加", exact: true }).click();
  const shortName = table.getByRole("combobox", { name: "2行目の勘定科目", exact: true });
  await shortName.focus();
  await selectAccount(shortName, { label: "旅費" });
  await table.getByRole("columnheader", { name: "勘定科目", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 800 });
  await settleMotion(app.locator("body"));
  await expect(select).toHaveValue("固定資産減価償却費");
  const dimensions = await select.evaluate(node => {
    const select = node as HTMLInputElement;
    const style = getComputedStyle(select);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = style.font;
    const cell = select.closest("th")!;
    const remove = cell.querySelector(".initiative-row-delete")!;
    const container = select.closest(".initiative-grid-scroll")!;
    return {
      available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20,
      text: context.measureText(select.value).width,
      contained: select.getBoundingClientRect().right <= remove.getBoundingClientRect().left
        && remove.getBoundingClientRect().right <= cell.getBoundingClientRect().right,
      horizontalScroll: container.scrollWidth > container.clientWidth,
    };
  });
  expect(dimensions.available).toBeGreaterThanOrEqual(dimensions.text);
  expect(dimensions.contained).toBe(true);
  expect(dimensions.horizontalScroll).toBe(true);
  expect(await app.locator("html").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const scroll = app.locator(".initiative-grid-scroll");
  await scroll.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  expect(await scroll.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  const edges = await table.getByRole("combobox").evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    const remove = node.closest("th")!.querySelector(".initiative-row-delete")!.getBoundingClientRect();
    return { left: rect.left, right: rect.right, remove: remove.left };
  }));
  expect(edges[0]).toEqual(edges[1]);
  const lastMonth = table.getByRole("spinbutton", { name: "固定資産減価償却費 3月の金額", exact: true });
  await lastMonth.scrollIntoViewIfNeeded();
  await expect(lastMonth).toBeInViewport();
  await lastMonth.fill("12.345");
  await expect(lastMonth).toHaveValue("12.345");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("固定資産減価償却費");
});
