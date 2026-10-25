import { readFile } from "node:fs/promises";
import { installCloneableFiles } from "./cloneable-files";
import { test, expect, settleMotion } from "./fixtures";

for (const theme of ["light", "dark"] as const) {
  test(`開始画面の主要操作は横にはみ出さず、幅に応じて並ぶ: ${theme}`, async ({ app }) => {
    await app.getByRole("switch", { name: "ダークテーマ" }).setChecked(theme === "dark");
    await settleMotion(app.locator("body"));
    const bounds = await app.locator(".entry-page").evaluate(node => {
      const box = (selector: string) => {
        const rect = node.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      };
      return { width: node.clientWidth, overflow: node.scrollWidth > node.clientWidth,
        recent: box(".entry-resume"), open: box(".entry-open-section"), create: box(".entry-create-section") };
    });
    expect(bounds.overflow).toBe(false);
    const resumeBox = (await app.locator(".entry-resume-button").boundingBox())!;
    const openBox = (await app.locator(".entry-file-button").boundingBox())!;
    expect(resumeBox.width).toBe(openBox.width);
    expect(resumeBox.height).toBe(openBox.height);
    expect(resumeBox.x).toBe(openBox.x);
    expect(bounds.open.y).toBeGreaterThanOrEqual(bounds.recent.bottom);
    if (bounds.width > 640) {
      expect(bounds.create.x).toBeGreaterThan(bounds.recent.right);
      expect(bounds.create.y).toBe(bounds.recent.y);
    } else {
      expect(bounds.create.y).toBeGreaterThanOrEqual(bounds.open.bottom);
      expect(bounds.create.x).toBe(bounds.recent.x);
    }
    for (const name of ["ファイルを開く", "新規作成"]) {
      const button = app.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      await expect(button).toBeEnabled();
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.width);
    }
    const slot = app.getByRole("spinbutton", { name: "年度", exact: true });
    const year = Number(await slot.getAttribute("aria-valuenow"));
    await slot.press("ArrowDown");
    await expect(slot).toHaveAttribute("data-moving", "false");
    await expect(slot).toHaveAttribute("aria-valuenow", String(year + 1));
    await app.getByRole("button", { name: "新規作成", exact: true }).click();
    await expect(app.getByLabel("基準年度", { exact: true })).toHaveText(`${year + 1}年度`);
  });
}

test("長い再開ファイル名と幅の境目でも操作を保つ", async ({ page }, testInfo) => {
  const bytes = Array.from(await readFile(new URL("../../samples/2027年度サンプル予算.triadic", import.meta.url)));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Triadic", exact: true })).toBeVisible();
  await page.evaluate(installCloneableFiles, { bytes, name: "2027年度サンプル予算.triadic" });
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText("2027年度サンプル予算.triadic");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.locator("#recent-file-name")).toHaveText("2027年度サンプル予算.triadic");
  await page.getByRole("switch", { name: "ダークテーマ" }).check();
  await page.setViewportSize({ width: 1774, height: 887 });
  await settleMotion(page.locator("body"));
  await page.screenshot({ path: testInfo.outputPath("entry-desktop.png") });
  const longName = "2027年度サンプル予算_部署別の検討内容と更新前後の比較を含む確認用の長いファイル名.triadic";
  await page.evaluate(installCloneableFiles, { bytes, name: longName });
  await page.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText(longName);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.locator("#recent-file-name")).toHaveText(longName);
  for (const width of [1774, 650, 320]) {
    await page.setViewportSize({ width, height: 887 });
    await settleMotion(page.locator("body"));
    expect(await page.locator(".entry-page").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.locator("#recent-file-name").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const resume = page.getByRole("button", { name: "続きから", exact: true });
    await resume.scrollIntoViewIfNeeded();
    await expect(resume).toBeInViewport();
    await expect(resume).toBeEnabled();
  }
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await expect(page.locator(".home-file-name")).toHaveText(longName);
});
