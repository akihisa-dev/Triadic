import { test, expect } from "@playwright/test";

test("確定予算のセルにフォーカス・ホバーしても比較の吹き出しを表示しない", async ({ page }) => {
  await page.goto("/tests/ui/budget-hints.html");
  const cells = page.locator(".initiative-amount-table input");
  const before = await cells.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  for (const month of [4, 5, 6]) {
    const cell = page.getByRole("spinbutton", { name: `売上高 ${month}月の金額`, exact: true });
    await cell.hover();
    await cell.focus();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(cell).not.toHaveAttribute("aria-describedby");
    await expect(cell.locator("..")).toHaveClass(/budget-manual-cell/);
  }
  expect(await cells.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(before);
  await page.getByRole("button", { name: "一次予算へ", exact: true }).click();
  await expect(page.locator(".budget-manual-cell")).toHaveCount(0);
  await page.getByRole("button", { name: "確定予算へ", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "売上高 4月の金額", exact: true })).toHaveValue("0");
  await expect(page.getByRole("spinbutton", { name: "売上高 6月の金額", exact: true })).toHaveValue("-2");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
