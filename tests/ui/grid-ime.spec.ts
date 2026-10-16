import { test, expect, selectClassification } from "./fixtures";

for (const kind of ["前年", "一次予算", "確定予算"]) test(`${kind}はIME処理のキーを表操作へ使わず、変換終了後の通常操作と保存を維持する`, async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.locator("body").evaluate(() => {
    const target = window as unknown as Window & { imeWrites: number; showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    target.imeWrites = 0;
    const pick = target.showOpenFilePicker;
    target.showOpenFilePicker = async () => {
      const handles = await pick(); const handle = handles[0]!; const create = handle.createWritable.bind(handle);
      handle.createWritable = async (...args) => { target.imeWrites++; return create(...args); };
      return handles;
    };
  });
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const nav = app.getByRole("navigation", { name: "メインナビゲーション" });
  if (kind === "前年") {
    await nav.getByRole("button", { name: "前年入力", exact: true }).click();
    await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
    await selectClassification(app.getByRole("combobox", { name: "業種名", exact: true }), "直営自動車");
  } else {
    await nav.getByRole("button", { name: "施策一覧", exact: true }).click();
    await app.getByRole("button", { name: "既存商品の販売拡大", exact: true }).click();
    await app.getByRole("tab", { name: kind, exact: true }).click();
  }
  const table = app.locator(kind === "前年" ? ".previous-grid" : ".initiative-amount-table");
  const first = table.locator('input[data-row="0"][data-column="0"]');
  const second = table.locator('input[data-row="0"][data-column="1"]');
  const selected = app.locator(kind === "前年" ? ".previous-cell-selected" : ".initiative-cell-selected");
  const original = [await first.inputValue(), await second.inputValue()];
  await page.mouse.move(page.viewportSize()!.width - 5, 100);
  await first.focus(); await first.press("Escape"); await first.press("Shift+ArrowRight");
  await expect(selected).toHaveCount(2); await expect(second).toBeFocused();
  for (const state of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
    await second.dispatchEvent("compositionstart");
    // Some IMEs send compositionend before the final keydown.
    if (!state.isComposing) await second.dispatchEvent("compositionend");
    for (const key of ["Enter", "Tab", "ArrowRight", "Delete", "Backspace", "Escape", "F2"]) {
      await second.dispatchEvent("keydown", { key, ...state });
      await expect(second).toBeFocused(); await expect(selected).toHaveCount(2);
      expect([await first.inputValue(), await second.inputValue()]).toEqual(original);
    }
    await second.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, ...state });
    expect([await first.inputValue(), await second.inputValue()]).toEqual(original);
    await second.dispatchEvent("compositionend");
  }
  await second.press("Enter");
  await expect(table.locator('input[data-row="1"][data-column="1"]')).toBeFocused();
  await first.press("Tab"); await expect(second).toBeFocused();
  await first.press("Escape"); await first.dispatchEvent("compositionstart");
  await first.fill("77");
  await page.waitForTimeout(800); // Composition must pause the 600ms autosave deadline.
  expect(await app.locator("body").evaluate(() => (window as unknown as { imeWrites: number }).imeWrites)).toBe(0);
  await first.dispatchEvent("compositionend");
  await first.dispatchEvent("keydown", { key: "Enter", keyCode: 229, isComposing: false });
  await expect(first).toBeFocused(); await expect(first).toHaveValue("77");
  await expect.poll(() => app.locator("body").evaluate(() => (window as unknown as { imeWrites: number }).imeWrites)).toBeGreaterThan(0);
  await expect(nav.getByRole("button", { name: "総原価表", exact: true })).toBeEnabled();
  await first.press("Tab"); await first.press("F2");
  await first.fill("0.0001"); await first.press("Enter"); await expect(first).toHaveAttribute("aria-invalid", "true");
  await first.press("Escape"); await expect(first).toHaveValue("77");
  await first.press("Shift+ArrowRight"); await second.press("ControlOrMeta+Enter");
  await expect(first).toHaveValue(original[1]!); await expect(second).toHaveValue(original[1]!);
});
