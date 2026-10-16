import { test, expect, selectClassification } from "./fixtures";

for (const kind of ["前年", "一次予算", "確定予算"]) test(`${kind}のセル内貼り付けは選択文字だけを置換し、挿入・全選択・取消ができる`, async ({ page, app, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
  const cell = app.getByRole(kind === "前年" ? "textbox" : "spinbutton", { name: `売上高 4月の${kind === "前年" ? "前年金額" : "金額"}`, exact: true }).first();
  const next = app.getByRole(kind === "前年" ? "textbox" : "spinbutton", { name: `売上高 5月の${kind === "前年" ? "前年金額" : "金額"}`, exact: true }).first();
  const nextOriginal = await next.inputValue();
  await cell.fill("1234.567"); await cell.press("Tab");
  await expect(nav.getByRole("button", { name: "総原価表", exact: true })).toBeEnabled();
  await cell.focus(); await cell.press("Escape"); await cell.press("Shift+ArrowRight");
  await cell.press("F2");
  await cell.press("ControlOrMeta+A"); await cell.press("ArrowLeft");
  await cell.press("ArrowRight"); await cell.press("ArrowRight");
  await cell.press("Shift+ArrowRight"); await cell.press("Shift+ArrowRight");
  await page.evaluate(() => navigator.clipboard.writeText("9"));
  await cell.press("ControlOrMeta+V");
  await expect(cell).toHaveValue("129.567"); await expect(next).toHaveValue(nextOriginal);
  await cell.press("ControlOrMeta+A"); await cell.press("ArrowLeft");
  await page.evaluate(() => navigator.clipboard.writeText("1")); await cell.press("ControlOrMeta+V");
  await expect(cell).toHaveValue("1129.567");
  await cell.press("ControlOrMeta+A");
  await page.evaluate(() => navigator.clipboard.writeText("0.0001")); await cell.press("ControlOrMeta+V");
  await expect(cell).toHaveValue("0.0001"); await cell.press("Enter");
  await expect(cell).toHaveAttribute("aria-invalid", "true");
  await cell.press("Escape"); await expect(cell).not.toHaveValue("0.0001");
  await expect(next).toHaveValue(nextOriginal);
  await cell.press("F2"); await cell.press("ControlOrMeta+A");
  await page.evaluate(() => navigator.clipboard.writeText("7.125")); await cell.press("ControlOrMeta+V");
  await expect(cell).toHaveValue("7.125"); await cell.press("Tab");
});
