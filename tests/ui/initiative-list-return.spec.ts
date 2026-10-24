import { test, expect } from "@playwright/test";

for (const count of [200, 201]) {
  test(`${count}件で詳細から戻ると同じ名称と並び順へ復帰しTabを続けられる`, async ({ page }) => {
    await page.goto(`/tests/ui/initiative-list-focus.html?count=${count}&longNames`);
    const table = page.getByRole("table", { name: "施策一覧", exact: true });
    const sort = table.getByRole("button", { name: "施策名", exact: true });
    await sort.click(); await sort.click();
    const name = table.getByRole("button", { name: /^施策001/ });
    await page.locator(".initiative-list-container").evaluate(node => { node.scrollTop = node.scrollHeight; });
    await name.press("Enter");
    await expect(page.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue(/^施策001/);
    await page.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).click();
    await expect(name).toBeFocused();
    await expect(sort.locator("..")).toHaveAttribute("aria-sort", "descending");
    await expect(name).toBeInViewport();
    await page.keyboard.press("Tab");
    await expect(table.getByRole("button", { name: /^施策000/ })).toBeFocused();
  });
}
for (const scenario of ["deleted", "recreated"]) {
  test(`${scenario}の施策へフォーカスを戻さず追加へ復帰`, async ({ page }) => {
    await page.goto(`/tests/ui/initiative-list-focus.html?count=201&longNames&${scenario}`);
    await page.getByRole("button", { name: /^施策000/ }).press("Enter");
    await page.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).click();
    await expect(page.getByRole("button", { name: "施策を追加", exact: true })).toBeFocused();
  });
}
