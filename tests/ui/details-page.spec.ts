import { test, expect } from "./fixtures";

test("明細は展開表の直下から空画面を開き、戻る・進むでも選択を復元する", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  const labels = await menu.getByRole("button").allTextContents();
  const expansion = labels.indexOf("展開表");
  expect(expansion).toBeGreaterThan(-1);
  expect(labels.slice(expansion, expansion + 3)).toEqual(["展開表", "明細", "前年入力"]);
  const details = menu.getByRole("button", { name: "明細", exact: true });
  await details.click();
  const screen = app.getByRole("main", { name: "明細", exact: true });
  await expect(screen).toBeVisible();
  await expect(screen).toHaveText("明細");
  await expect(screen.locator("input, button, select, textarea, table")).toHaveCount(0);
  await expect(details).toHaveAttribute("aria-current", "page");
  await app.getByRole("button", { name: "前の画面に戻る", exact: true }).click();
  await expect(app.getByRole("main", { name: "ホーム", exact: true })).toBeVisible();
  await expect(details).not.toHaveAttribute("aria-current", "page");
  await app.getByRole("button", { name: "次の画面に進む", exact: true }).click();
  await expect(screen).toBeVisible();
  await expect(details).toHaveAttribute("aria-current", "page");
  await menu.getByRole("button", { name: "前年入力", exact: true }).click();
  await expect(app.getByRole("heading", { name: "前年入力", exact: true })).toBeVisible();
});
