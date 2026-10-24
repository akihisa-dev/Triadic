import { test, expect } from "@playwright/test";
for (const count of [200, 201]) {
  test(`${count}件の省略名はホバーとフォーカスで全文と備考を表の外へ表示する`, async ({ page }) => {
    await page.goto(`/tests/ui/initiative-list-focus.html?count=${count}&longNames`);
    const first = page.getByRole("button", { name: /^施策000/ });
    const name = await first.textContent();
    const row = first.locator("xpath=ancestor::tr");
    const before = await row.boundingBox();
    await first.hover();
    const tooltip = page.getByRole("tooltip");
    if (count === 200) {
      await expect(tooltip).toHaveCount(0);
      await first.focus();
      await expect(tooltip).toHaveCount(0);
      return;
    }
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(name!);
    await expect(tooltip).toContainText("名称とは異なる備考の内容");
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.getByRole("heading", { name: "施策一覧", exact: true }).hover();
    await expect(tooltip).toHaveCount(0);
    await first.focus();
    await expect(tooltip).toBeVisible();
    await expect(first).toHaveAccessibleName(name!);
    const popup = (await tooltip.boundingBox())!;
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.y).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(popup.y + popup.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await row.boundingBox()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await expect(first).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /^施策001/ })).toBeFocused();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).not.toContainText("名称とは異なる備考の内容");
    await page.keyboard.press("Enter");
    await expect(tooltip).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue(/^施策001/);
  });
}
