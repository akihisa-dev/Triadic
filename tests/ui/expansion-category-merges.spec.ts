import { test, expect } from "./fixtures";

test("展開・期間内の同じ区分をまとめて結合し、その他と未選択を表示する", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=large");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "展開表", exact: true }).click();
  const table = app.getByRole("table", { name: "展開表", exact: true });
  const cost = table.locator("tbody").filter({ has: app.locator(".expansion-group").filter({ hasText: /^コスト$/ }) });
  await expect(cost.locator(".expansion-category")).toHaveText(["下払いUP", "ベースアップ", "設備投資", "燃料費UP", "電気料金UP", "その他"]);
  await expect(cost.locator(".expansion-category").first()).toHaveAttribute("rowspan", "1");
  const other = cost.getByRole("row").filter({ has: app.getByRole("button", { name: "本社・荷主マスタ統合とアクセス管理整備", exact: true }) });
  await expect(other.locator(".expansion-category")).toHaveText("その他");
  await expect(other.locator(".expansion-category")).toHaveAttribute("rowspan", "3");
  await expect(table.locator("tbody .expansion-category").filter({ hasText: /^$/ }).first()).toHaveAttribute("rowspan", /[2-9]|\d{2,}/);
});

test("大量行の途中から描画しても区分セルの結合と列位置を保つ", async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=signed-categories-large");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "展開表", exact: true }).click();
  const table = app.getByRole("table", { name: "展開表", exact: true });
  const region = app.getByRole("region", { name: "展開表の月別種別・比較", exact: true });
  for (const top of [0, 1600, 3200, 4900]) {
    await region.evaluate((node, top) => { node.scrollTop = top; }, top);
    await expect.poll(async () => table.locator("tbody tr[aria-rowindex]").first().getAttribute("aria-rowindex")).not.toBeNull();
    await expect.poll(async () => table.locator("tbody .expansion-category").first().getAttribute("rowspan")).toMatch(/^[1-9]\d*$/);
    await expect.poll(() => table.locator("tbody tr[aria-rowindex]").evaluateAll(rows => {
      const items = rows.filter(row => !row.classList.contains("expansion-subtotal"));
      return items.length > 0 && items.every(row => {
        const parent = row.parentElement;
        if (!parent) return false;
        const item = Number(row.querySelector(".initiative-name-button")!.textContent!.replace("区分確認", ""));
        const group = [...parent.querySelectorAll(".expansion-category")].find(cell => {
          const start = Number(cell.parentElement!.getAttribute("aria-rowindex"));
          const index = Number(row.getAttribute("aria-rowindex"));
          return start <= index && index < start + (cell as HTMLTableCellElement).rowSpan;
        });
        return group?.textContent === ["負ID区分", "ゼロID区分", "正ID区分", ""][item % 4];
      });
    })).toBe(true);
  }
});
