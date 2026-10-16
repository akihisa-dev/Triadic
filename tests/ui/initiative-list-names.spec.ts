import { test, expect } from "@playwright/test";

for (const count of [200, 201]) {
  test(`${count}件で長い名称の表示方針と詳細での全文確認が一致`, async ({ page }) => {
    await page.goto(`/tests/ui/initiative-list-focus.html?count=${count}&longNames`);
    const table = page.getByRole("table", { name: "施策一覧", exact: true });
    await expect(table).toHaveAttribute("aria-rowcount", String(count + 3));
    for (const index of [0, 1]) {
      const name = `施策${String(index).padStart(3, "0")}${"・長い名称でも対象の施策と内容を正確に確認するための事業計画".repeat(3)}`;
      const button = table.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveAccessibleName(name);
      const metrics = await button.evaluate(node => ({
        whiteSpace: getComputedStyle(node).whiteSpace, overflow: getComputedStyle(node).textOverflow,
        height: node.closest("tr")!.getBoundingClientRect().height,
        hiddenText: node.scrollWidth > node.clientWidth,
      }));
      if (count <= 200) {
        expect(metrics.whiteSpace).toBe("normal");
        expect(metrics.height).toBeGreaterThan(28);
        expect(metrics.hiddenText).toBe(false);
      } else {
        expect(metrics.whiteSpace).toBe("nowrap");
        expect(metrics.overflow).toBe("ellipsis");
        expect(metrics.height).toBe(28);
        expect(metrics.hiddenText).toBe(true);
      }
      await button.press("Enter");
      await expect(page.getByRole("textbox", { name: "施策名", exact: true })).toHaveValue(name);
      await expect(page.getByRole("textbox", { name: "備考", exact: true })).toHaveValue(index === 0 ? "名称とは異なる備考の内容" : "");
      await page.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).click();
      await expect(table).toBeVisible();
    }
  });
}
