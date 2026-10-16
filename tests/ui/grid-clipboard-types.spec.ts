import { test, expect, selectClassification } from "./fixtures";

for (const kind of ["前年", "一次予算", "確定予算"]) test(`${kind}は非テキスト貼り付けで単一セルも選択範囲も消去・保存しない`, async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html?data=full");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.locator("body").evaluate(() => {
    const target = window as unknown as Window & { clipboardWrites: number; showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    target.clipboardWrites = 0;
    const pick = target.showOpenFilePicker;
    target.showOpenFilePicker = async () => {
      const handles = await pick();
      const handle = handles[0]!;
      const create = handle.createWritable.bind(handle);
      handle.createWritable = async (...args) => { target.clipboardWrites++; return create(...args); };
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
  const cell = (month: number) => app.getByRole(kind === "前年" ? "textbox" : "spinbutton", { name: `売上高 ${month}月の${kind === "前年" ? "前年金額" : "金額"}`, exact: true }).first();
  const first = cell(4), next = cell(5);
  const originals = [await first.inputValue(), await next.inputValue()];
  const paste = (format: string) => first.evaluate((node, type) => {
    const clipboardData = new DataTransfer();
    if (type === "image" || type === "file") clipboardData.items.add(new File(["test"], type === "image" ? "capture.png" : "data.bin", { type: type === "image" ? "image/png" : "application/octet-stream" }));
    else if (type === "html") clipboardData.setData("text/html", "<p>9</p>");
    else clipboardData.setData("text/plain", type === "empty-text" ? "" : "9");
    node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData }));
  }, format);
  for (const range of [false, true]) for (const editing of [false, true]) {
    await first.focus(); await first.press("Escape");
    if (range) await first.press("Shift+ArrowRight");
    if (editing) await first.press("F2");
    for (const format of ["image", "file", "html"]) {
      await paste(format);
      expect([await first.inputValue(), await next.inputValue()]).toEqual(originals);
    }
  }
  await page.waitForTimeout(800); // Beyond autosave's 600ms deadline: unsupported paste must start no save.
  expect(await app.locator("body").evaluate(() => (window as unknown as { clipboardWrites: number }).clipboardWrites)).toBe(0);
  await first.press("Escape"); await first.press("Shift+ArrowRight");
  await paste("text"); await expect(first).toHaveValue("9"); await expect(next).toHaveValue("9");
  await expect.poll(() => app.locator("body").evaluate(() => (window as unknown as { clipboardWrites: number }).clipboardWrites)).toBeGreaterThan(0);
  await first.press("Escape"); await first.press("Shift+ArrowRight");
  await paste("empty-text"); await expect(first).toHaveValue("0"); await expect(next).toHaveValue("0");
});
