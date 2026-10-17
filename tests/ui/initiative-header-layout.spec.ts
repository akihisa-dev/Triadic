import { openInitiativeEntry, test, expect, settleMotion } from "./fixtures";

for (const editing of [false, true]) {
  test(`${editing ? "登録済み施策" : "新規施策"}の上段に施策名・備考、下段に分類欄を配置する`, async ({ page, app }, testInfo) => {
    await page.goto("/tests/ui/preview.html");
    await expect(page.getByRole("status")).toHaveText("操作できます");
    await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    if (editing) {
      await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "施策一覧", exact: true }).click();
      await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
    } else await openInitiativeEntry(app);
    await app.getByRole("heading", { name: "施策入力", exact: true }).click();
    const name = app.getByRole("textbox", { name: "施策名", exact: true });
    const note = app.getByRole("textbox", { name: "備考", exact: true });
    const originalNote = await note.inputValue();
    for (const width of [1920, 1280, 900, 600, 375]) {
      await page.setViewportSize({ width, height: 864 });
      await settleMotion(app.locator("body"));
      const nameBox = (await name.boundingBox())!;
      const noteBox = (await note.boundingBox())!;
      expect(Math.abs(nameBox.width - noteBox.width)).toBeLessThan(1);
      if (width >= 900) {
        expect(noteBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
        expect(noteBox.y).toBe(nameBox.y);
      } else expect(noteBox.y).toBeGreaterThanOrEqual(nameBox.y);
      if (!editing) {
        const register = (await app.getByRole("button", { name: "登録", exact: true }).boundingBox())!;
        if (width >= 900) {
          expect(register.x).toBeGreaterThan(noteBox.x + noteBox.width);
          expect(register.y).toBe(noteBox.y);
        } else expect(register.y).toBeGreaterThanOrEqual(noteBox.y);
      }
      const text = (await app.locator(".initiative-text-fields").boundingBox())!;
      const slots = (await app.locator(".initiative-classification-fields").boundingBox())!;
      expect(slots.x).toBe(text.x);
      expect(slots.y).toBeGreaterThanOrEqual(text.y + text.height);
      expect(slots.y - text.y - text.height).toBeLessThanOrEqual(8);
      const titleRow = (await app.locator(".initiative-title-row").boundingBox())!;
      expect(text.y - titleRow.y - titleRow.height).toBeLessThanOrEqual(8);
      const tabs = (await app.getByRole("tablist", { name: "入力する種別" }).boundingBox())!;
      expect(tabs.y - slots.y - slots.height).toBeLessThanOrEqual(8);
      const grid = (await app.locator(".initiative-grid-scroll").boundingBox())!;
      // 選択合計の高さだけを確保し、選択前後で表の位置を動かさない。
      expect(grid.y - tabs.y - tabs.height).toBeLessThanOrEqual(26);
      if (width >= 900) {
        const heading = (await app.getByRole("heading", { name: "施策入力", exact: true }).boundingBox())!;
        const back = (await app.getByRole("button", { name: "← 施策一覧へ戻る", exact: true }).boundingBox())!;
        const center = (box: typeof heading) => box.y + box.height / 2;
        expect(Math.abs(center(heading) - center(back))).toBeLessThan(1);
        expect(nameBox.width).toBe(320);
        expect(nameBox.height).toBe(editing ? 46 : 36);
        if (editing) {
          const duplicate = (await app.getByRole("button", { name: "複製して新規作成", exact: true }).boundingBox())!;
          expect(Math.abs(center(heading) - center(duplicate))).toBeLessThan(1);
        }
      }
      expect(await app.locator("html").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(note).toHaveValue(originalNote);
      if (width === 1920 || width === 600) await testInfo.attach(`施策入力-${editing ? "編集" : "新規"}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    }
    await page.setViewportSize({ width: 1280, height: 864 });
    const gridBefore = (await app.locator(".initiative-grid-scroll").boundingBox())!;
    await app.getByRole("tab", { name: "確定予算", exact: true }).click();
    const firstAmount = app.locator('.initiative-amount-table input[data-row="0"][data-column="0"]');
    if (await firstAmount.isEnabled()) {
      await firstAmount.click();
      await expect(app.locator(".grid-selection-total")).toContainText("選択範囲の合計");
      expect((await app.locator(".initiative-grid-scroll").boundingBox())!.y).toBe(gridBefore.y);
    }
  });
}
