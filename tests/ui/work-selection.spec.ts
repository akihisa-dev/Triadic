import { test, expect, openInitiativeEntry } from "./fixtures";

test("ファイルを開くと4つの入口が現れ、一次・確定を選んで一覧へ進める", async ({ page, app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const selection = app.getByRole("main", { name: "作業を選択", exact: true });
  await expect(selection).toBeVisible();
  await expect(app.getByRole("complementary", { name: "メニュー" })).toHaveCount(0);
  for (const name of ["施策を検索", "操作を取り消す", "ウィンドウを複製", "前の画面に戻る", "サイドバーを開く"]) {
    await expect(app.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(selection.getByRole("button")).toHaveCount(4);
  for (const name of ["見通し・実績", "修正予算"]) {
    await expect(selection.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(selection.getByRole("button", { name, exact: true })).toHaveAccessibleDescription("未実装");
  }
  for (const name of ["一次予算", "確定予算"]) {
    const button = selection.getByRole("button", { name, exact: true });
    await button.focus();
    await button.press("Enter");
    await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
    await expect(app.getByRole("complementary", { name: "メニュー" })).toBeVisible();
    await expect(app.getByLabel("予算フェーズ", { exact: true })).toHaveText(name);
    await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "作業を選択", exact: true }).click();
    await expect(selection).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(selection.locator(".work-selection-symbol").first()).toHaveCSS("transition-duration", "0s");
  const overflow = await selection.evaluate(element => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
});

test("入口に戻っても登録前の入力を保持し、別の予算へ進む前に破棄を確認する", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "一次予算", exact: true }).click();
  await openInitiativeEntry(app);
  await app.getByRole("textbox", { name: "施策名", exact: true }).fill("保持する入力");
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "作業を選択", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "確定予算", exact: true }).click();
  const dialog = app.getByRole("alertdialog", { name: "入力内容を破棄しますか？", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "確定予算", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "破棄して一覧へ戻る", exact: true }).click();
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});


test("4分割の下からアプリ全体の説明を開き、通常画面を出さずに戻れる", async ({ app }, testInfo) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const information = app.getByRole("navigation", { name: "アプリの仕組み", exact: true });
  const selection = app.getByRole("main", { name: "作業を選択", exact: true });
  await expect(information.getByRole("button")).toHaveText(["関連図", "画面とデータ", "計算の仕組み", "処理の流れ"]);
  const menuBox = (await selection.boundingBox())!;
  const linksBox = (await information.boundingBox())!;
  expect(linksBox.y).toBeGreaterThanOrEqual(menuBox.y + menuBox.height - 1);
  const linkBoxes = await information.getByRole("button").evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(); return { x: box.x, y: box.y };
  }));
  expect(linkBoxes[0]!.y).toBeCloseTo(linkBoxes[1]!.y);
  if (testInfo.project.name === "desktop") expect(linkBoxes[0]!.y).toBeCloseTo(linkBoxes[3]!.y);
  else expect(linkBoxes[2]!.y).toBeGreaterThan(linkBoxes[0]!.y);
  for (const [name, region] of [["関連図", "画面とマスタの相関図"], ["画面とデータ", "画面とデータの対応図"], ["計算の仕組み", "計算の仕組み"], ["処理の流れ", "処理の流れ"]] as const) {
    await information.getByRole("button", { name, exact: true }).press("Enter");
    await expect(app.getByRole("region", { name: region, exact: true })).toBeVisible();
    await expect(app.getByRole("complementary", { name: "メニュー" })).toHaveCount(0);
    await expect(app.getByRole("button", { name: "施策を検索", exact: true })).toHaveCount(0);
    await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toHaveCount(0);
    await expect(app.getByRole("group", { name: "ホームの表示", exact: true }).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await app.getByRole("button", { name: "← 作業を選択", exact: true }).click();
    await expect(selection).toBeVisible();
  }
  await selection.getByRole("button", { name: "確定予算", exact: true }).click();
  await expect(app.getByLabel("予算フェーズ", { exact: true })).toHaveText("確定予算");
  const navigation = app.getByRole("navigation", { name: "メインナビゲーション" });
  await expect(navigation.getByRole("button", { name: "Home", exact: true })).toHaveCount(0);
  await expect(app.getByRole("button", { name: "操作を取り消す", exact: true })).toBeDisabled();
});
