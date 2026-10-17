import { test, expect, settleMotion } from "./fixtures";

for (const screen of ["マスタ", "入出力", "履歴"] as const) {
  test(`${screen}の余白を詰め、文字とアイコンのサイズと操作を維持する`, async ({ page, app }, testInfo) => {
    await page.goto("/tests/ui/preview.html");
    await expect(page.getByRole("status")).toHaveText("操作できます");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: screen, exact: true }).click();
    await app.getByRole("heading", { name: screen, exact: true }).click();
    await settleMotion(app.locator("body"));
    if (screen === "マスタ") {
      const items = app.locator(".master-menu-item");
      await expect(items).toHaveCount(9);
      const metrics = await items.first().evaluate(node => {
        const icon = node.querySelector(".master-menu-icon svg")!;
        const row = node.getBoundingClientRect();
        const label = node.querySelector(".master-menu-label")!.getBoundingClientRect();
        return { height: node.getBoundingClientRect().height, title: getComputedStyle(node.querySelector("strong")!).fontSize,
          description: getComputedStyle(node.querySelector(".master-menu-label > span")!).fontSize,
          contentInside: label.top >= row.top && label.bottom <= row.bottom,
          icon: [icon.getBoundingClientRect().width, icon.getBoundingClientRect().height] };
      });
      if (testInfo.project.name === "desktop") expect(metrics.height).toBe(64);
      expect(metrics.contentInside).toBe(true);
      expect(metrics.title).toBe("15px");
      expect(metrics.description).toBe("12px");
      expect(metrics.icon).toEqual([24, 24]);
      await items.last().click();
      await expect(app.getByRole("heading", { name: "金額項目マスタ", exact: true })).toBeVisible();
    } else if (screen === "入出力") {
      for (const name of ["展開表", "施策一覧"]) {
        const checkbox = app.getByRole("checkbox", { name, exact: true });
        const row = app.locator(".io-table-option").filter({ has: checkbox });
        const label = (await row.locator(".io-check").boundingBox())!;
        const slots = (await row.locator(".kind-selection-slots").boundingBox())!;
        if (testInfo.project.name === "desktop") {
          expect(slots.x).toBeGreaterThan(label.x + label.width);
          expect(Math.abs(slots.y + slots.height / 2 - label.y - label.height / 2)).toBeLessThan(1);
        } else expect(slots.y).toBeGreaterThanOrEqual(label.y + label.height);
        expect(await row.locator(".gliding-kind-slot button").first().evaluate(node => getComputedStyle(node).fontSize)).toBe("12px");
        await checkbox.uncheck();
        await expect(row.locator(".kind-selection-slots")).toHaveCount(0);
        await checkbox.check();
        await row.getByRole("button", { name: "確定予算", exact: true }).first().click();
        await expect(row.getByRole("button", { name: "確定予算", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
      }
      await expect(app.getByRole("button", { name: "選んだ表を出力", exact: true })).toBeEnabled();
    } else {
      const heading = (await app.getByRole("heading", { name: "履歴", exact: true }).boundingBox())!;
      const actions = (await app.locator(".data-history-actions").boundingBox())!;
      if (testInfo.project.name === "desktop") expect(Math.abs(heading.y + heading.height / 2 - actions.y - actions.height / 2)).toBeLessThan(1);
      expect(await app.locator("h1").evaluate(node => getComputedStyle(node).fontSize)).toBe("22px");
      expect(await app.locator(".data-history-actions").evaluate(node => getComputedStyle(node).fontSize)).toBe("13px");
      await app.getByRole("checkbox", { name: "すべての履歴を選択", exact: true }).check();
      const deletion = app.getByRole("button", { name: "選択した履歴を削除", exact: true });
      await expect(deletion).toBeEnabled();
      await deletion.click();
      await app.getByRole("alertdialog").getByRole("button", { name: "キャンセル", exact: true }).click();
      await expect(app.locator(".history-date")).toHaveCount(3);
    }
    expect(await app.locator("html").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await testInfo.attach(screen, { body: await page.screenshot(), contentType: "image/png" });
  });
}
