import { test, expect, settleMotion } from "./fixtures";

test("入出力の分類候補は明暗・画面幅にかかわらず全文を読め、個別選択と全件へ戻す操作を保つ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "入出力", exact: true }).click();
  await expect(app.getByRole("heading", { name: "入出力", exact: true })).toBeVisible();
  const menu = app.locator(".home-header").getByRole("button", { name: /サイドバー/ });
  for (const dark of [false, true]) {
    await app.getByRole("switch", { name: "ダークテーマ" }).setChecked(dark);
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 1200 });
      if (await menu.getAttribute("aria-expanded") === "true") await menu.click();
      await page.mouse.move(width - 5, 10);
      await settleMotion(app.locator("body"));
      for (const label of ["業種名", "部署名"]) {
        const group = app.getByRole("group", { name: label, exact: true });
        for (const button of await group.getByRole("button").all()) {
          await button.scrollIntoViewIfNeeded();
          // A visible box alone does not prove the name is readable: check the
          // whole text and that each button stays inside its available group.
          const readable = await button.evaluate(node => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const text = range.getBoundingClientRect();
            const box = node.getBoundingClientRect();
            const group = node.parentElement!.getBoundingClientRect();
            return node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1
              && text.left >= box.left && text.right <= box.right
              && box.left >= group.left && box.right <= group.right + 1;
          });
          expect(readable, `${width}px ${label}: ${await button.textContent()}`).toBe(true);
        }
      }
      const industries = app.getByRole("group", { name: "業種名", exact: true });
      const a = industries.getByRole("button", { name: "不動産A", exact: true });
      const b = industries.getByRole("button", { name: "不動産B", exact: true });
      await a.click();
      await expect(a).toHaveAttribute("aria-pressed", "true");
      await expect(b).toHaveAttribute("aria-pressed", "false");
      await b.click();
      await a.press("Space");
      await expect(a).toHaveAttribute("aria-pressed", "false");
      await expect(b).toHaveAttribute("aria-pressed", "true");
      const all = industries.getByRole("button", { name: "全業種の合計", exact: true });
      await all.click();
      await expect(all).toHaveAttribute("aria-pressed", "true");
      await expect(b).toHaveAttribute("aria-pressed", "false");
    }
  }
});
