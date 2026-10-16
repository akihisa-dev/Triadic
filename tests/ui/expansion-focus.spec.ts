import { test, expect } from "@playwright/test";
for (const count of [192, 193, 1000]) test(`${count}施策の展開表で遠方スクロール後もフォーカスと縦結合を維持`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/tests/ui/expansion-focus.html?count=${count}`);
  const table = page.getByRole("table", { name: "展開表", exact: true });
  await expect(table).toBeVisible();
  if (count > 192) await expect(table).toHaveClass(/virtual-table/);
  else await expect(table).not.toHaveClass(/virtual-table/);
  const container = page.locator(".initiative-list-container");
  const first = table.getByRole("button", { name: "施策000", exact: true });
  await first.focus();
  const height = await container.evaluate(node => node.scrollHeight);
  await container.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(table.getByRole("button", { name: `施策${String(count - 1).padStart(3, "0")}`, exact: true })).toBeAttached();
  if (count > 192) await expect(table.locator("tr[aria-rowindex='45']")).toHaveCount(0);
  await expect(first).toBeFocused();
  expect(await container.evaluate(node => node.scrollHeight)).toBe(height);
  // Every span ends within its contiguous run and cannot cover spacer rows.
  expect(await table.locator("tbody").evaluateAll(bodies => bodies.every(tbody => [...tbody.querySelectorAll<HTMLTableRowElement>("tr")].every((row, index, rows) => [...row.querySelectorAll<HTMLTableCellElement>("[rowspan]")].every(cell => rows.slice(index, index + cell.rowSpan).every(next => !next.classList.contains("virtual-row-spacer"))))))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(table.getByRole("button", { name: "施策001", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("開いた施策")).toHaveText("1:施策000");
  await container.evaluate(node => { node.scrollTop = 39 * 28; });
  const boundary = table.getByRole("button", { name: "施策039", exact: true });
  await boundary.focus();
  await container.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(table.getByRole("button", { name: `施策${String(count - 1).padStart(3, "0")}`, exact: true })).toBeAttached();
  await expect(boundary).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(table.getByRole("button", { name: "施策040", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(boundary).toBeFocused();
  await page.getByRole("button", { name: "種別切替", exact: true }).click();
  await expect(table).toBeVisible();
  if (count > 192) {
    await container.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(table.getByRole("button", { name: `施策${String(count - 1).padStart(3, "0")}`, exact: true })).toBeAttached();
    await expect(first).toHaveCount(0);
    expect(await table.locator("tbody tr[aria-rowindex]").count()).toBeLessThan(100);
  }
  expect(await container.evaluate(node => node.scrollHeight)).toBe(height);
  expect(errors).toEqual([]);
});
