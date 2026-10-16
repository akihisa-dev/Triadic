import { test, expect, selectClassification } from "./fixtures";

for (const kind of ["前年", "一次予算", "確定予算"]) test(`${kind}のドラッグは非アクティブ化と左ボタン解放で終了し、ホバーで選択しない`, async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
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
  const cell = (month: number) => app.getByRole(kind === "前年" ? "textbox" : "spinbutton", { name: `売上高 ${month}月の${kind === "前年" ? "前年金額" : "金額"}`, exact: true }).first();
  const first = cell(4), second = cell(5), third = cell(6);
  const selected = app.locator(kind === "前年" ? ".previous-cell-selected" : ".initiative-cell-selected");
  const original = [await first.inputValue(), await second.inputValue(), await third.inputValue()];
  const down = () => first.dispatchEvent("pointerdown", { button: 0, buttons: 1, pointerId: 1 });
  const enter = (target: typeof first, buttons: number) => target.locator("..").dispatchEvent("pointerover", { buttons, pointerId: 1, pointerType: "mouse" });
  for (const boundary of ["blur", "hidden", "pointerup", "pointercancel"]) {
    await down(); await enter(second, 1); await expect(selected).toHaveCount(2);
    await app.locator("body").evaluate((node, eventType) => {
      const target = node.ownerDocument.defaultView!;
      if (eventType === "hidden") {
        const document = node.ownerDocument;
        const descriptor = Object.getOwnPropertyDescriptor(document, "hidden");
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        if (descriptor) Object.defineProperty(document, "hidden", descriptor);
        else Reflect.deleteProperty(document, "hidden");
      } else target.dispatchEvent(new Event(eventType));
    }, boundary);
    await enter(third, 1); await expect(selected).toHaveCount(2);
    await enter(third, 0); await expect(selected).toHaveCount(2);
  }
  await down(); await enter(second, 0); await expect(selected).toHaveCount(1);
  await enter(third, 1); await expect(selected).toHaveCount(1);
  await down(); await enter(second, 2); await enter(third, 1); await expect(selected).toHaveCount(1);
  await down(); await enter(third, 1); await expect(selected).toHaveCount(3);
  await first.dispatchEvent("pointerup", { button: 0, buttons: 0, pointerId: 1 });
  await first.press("Escape"); await first.press("Shift+ArrowRight"); await expect(selected).toHaveCount(2);
  await second.press("ArrowRight"); await expect(selected).toHaveCount(1); await expect(third).toBeFocused();
  expect([await first.inputValue(), await second.inputValue(), await third.inputValue()]).toEqual(original);
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
});
