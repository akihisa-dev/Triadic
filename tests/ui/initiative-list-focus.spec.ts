import { test, expect } from "@playwright/test";

for (const count of [200, 201, 1000]) {
  test(`${count}件の施策一覧で遠方スクロール後もTabとEnterの対象を維持`, async ({ page }) => {
    await page.goto(`/tests/ui/initiative-list-focus.html?count=${count}`);
    const table = page.getByRole("table", { name: "施策一覧", exact: true });
    await expect(table).toHaveAttribute("aria-rowcount", String(count + 3));
    const first = table.getByRole("button", { name: "施策000", exact: true });
    // Enter the body after the current header controls, including monthly filters.
    const lastHeader = table.locator("thead").getByRole("button").last();
    await expect(lastHeader).toHaveAccessibleName("3月 利益を絞り込む");
    await lastHeader.focus();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    const container = page.locator(".initiative-list-container");
    const height = await container.evaluate(node => node.scrollHeight);
    await container.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(table.getByRole("button", { name: `施策${String(count - 1).padStart(3, "0")}`, exact: true })).toBeAttached();
    // Wait for the virtual range change before checking the focused offscreen row.
    if (count > 200) await expect(table.locator("tbody tr[aria-rowindex='43']")).toHaveCount(0);
    await expect(first).toBeFocused();
    await expect(first.locator("xpath=ancestor::tr")).toHaveAttribute("aria-rowindex", "3");
    expect(await container.evaluate(node => node.scrollHeight)).toBe(height);
    if (count <= 200) await expect(table.locator("tbody tr[aria-rowindex]")).toHaveCount(count);
    if (count > 200) expect(await table.locator("tbody tr[aria-rowindex]").count()).toBeLessThan(100);
    await page.keyboard.press("Tab");
    const next = table.getByRole("button", { name: "施策001", exact: true });
    await expect(next).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("開いた施策")).toHaveText("1:施策000");
    // A focused row is released when focus leaves the table.
    await page.getByRole("button", { name: "種別切替", exact: true }).click();
    if (count > 200) {
      await container.evaluate(node => { node.scrollTop = node.scrollHeight; });
      await expect(first).toHaveCount(0);
      expect(await table.locator("tbody tr[aria-rowindex]").count()).toBeLessThan(100);
    }
    await container.evaluate(node => { node.scrollTop = 0; });
    await first.press("Enter");
    await expect(page.getByLabel("開いた施策")).toHaveText("1:施策000");
    await table.getByRole("button", { name: "施策名", exact: true }).click();
    await table.getByRole("button", { name: "施策名", exact: true }).click();
    await container.evaluate(node => { node.scrollTop = 0; });
    const lastName = `施策${String(count - 1).padStart(3, "0")}`;
    await table.getByRole("button", { name: lastName, exact: true }).press("Enter");
    await expect(page.getByLabel("開いた施策")).toHaveText(`${count}:${lastName}`);
    await page.getByRole("button", { name: "過去と現在を切替" }).click();
    await container.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await first.press("Enter");
    await expect(page.getByLabel("開いた施策")).toHaveText("1:施策000");
    await page.getByRole("button", { name: "過去と現在を切替" }).click();
    await first.press("Enter");
    await expect(page.getByLabel("開いた施策")).toHaveText("1:施策000");
  });
}
