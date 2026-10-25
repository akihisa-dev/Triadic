import { selectAccount, openInitiativeEntry, test, expect, settleMotion, attachImage, selectClassification } from "./fixtures";
import { installCloneableFiles } from "./cloneable-files";
import type { FrameLocator, Locator } from "@playwright/test";

const blue = "rgb(0, 51, 255)";
const ink = "rgb(52, 52, 52)";
const soft = "rgb(234, 229, 217)";
const routes = ["Home", "前年入力", "施策一覧", "総原価表", "展開表", "マスタ", "履歴", "入出力"];

async function navigate(app: FrameLocator, name: string) {
  if (name === "施策入力") await openInitiativeEntry(app);
  else await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name, exact: true }).click();
  await expect(app.getByRole("heading", { name, exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
}

async function expectEditingColor(input: Locator, startCellEditing = false) {
  await input.click();
  if (startCellEditing) {
    await expect(input).toHaveClass("grid-amount-idle");
    await expect(input).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
    await input.press("F2");
    await expect(input).not.toHaveClass("grid-amount-idle");
  }
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("outline-color", blue);
  await expect(input).toHaveCSS("caret-color", blue);
  await expect(input).toHaveCSS("background-color", /^(rgb\((250, 247, 239|244, 240, 230|234, 229, 217)\)|rgba\(0, 0, 0, 0\))$/);
}

test.beforeEach(async ({ page, app }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(app.getByRole("main", { name: "ホーム", exact: true })).toBeVisible();
});

test("全画面で選択中のサイドバーアイコンが青くなり、文字・背景・装飾棒は変わらない", async ({ app }) => {
  const navigation = app.getByRole("navigation", { name: "メインナビゲーション" });
  for (const current of routes) {
    await navigate(app, current);
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    const leakedColor = await app.locator("main").evaluate(main => {
      const properties = ["color", "backgroundColor", "borderColor", "stroke"] as const;
      return [...main.querySelectorAll('h1, table th, table td, .kind-tabs button:not([aria-selected="true"]), .home-relation-name, .home-relation-subnode')]
        .filter(node => properties.some(property => getComputedStyle(node)[property].includes("rgb(0, 51, 255)")))
        .map(node => node.tagName);
    });
    expect(leakedColor, "表・見出し・未選択の種別タブ・相関図の名称と説明に青を広げない").toEqual([]);
    for (const name of routes) {
      const item = navigation.getByRole("button", { name, exact: true });
      await expect(item.locator("svg")).toHaveCSS("color", name === current ? blue : ink);
      await expect(item.locator("span")).toHaveCSS("color", ink);
      if (name === current) {
        await expect(item).toHaveCSS("background-color", soft);
        await expect(item).toHaveCSS("border-left-width", "0px");
        await expect(item).toHaveCSS("box-shadow", "none");
        for (const pseudo of ["::before", "::after"]) {
          expect(await item.evaluate((node, selector) => getComputedStyle(node, selector).content, pseudo)).toBe("none");
        }
      }
    }
  }
  await app.locator(".home-header").getByRole("button", { name: /サイドバー/ }).click();
  await settleMotion(app.locator("body"));
  await expect(navigation.getByRole("button", { name: routes.at(-1)!, exact: true }).locator("svg")).toHaveCSS("color", blue);
});

test("施策の文字・金額・科目・分類に青い編集枠が付き、解除すると戻る", async ({ page, app }, testInfo) => {
  await navigate(app, "施策入力");
  await page.mouse.move(page.viewportSize()!.width - 10, 200);
  await settleMotion(app.locator("body"));
  await app.locator(".home-header").getByRole("button", { name: "サイドバーを開く", exact: true }).click();
  await settleMotion(app.locator("body"));
  const name = app.getByRole("textbox", { name: "施策名", exact: true });
  const before = await name.boundingBox();
  await expectEditingColor(name);
  expect(await name.boundingBox()).toEqual(before);
  await attachImage(testInfo, "青い編集枠と選択アイコン", await page.locator("#app-preview").screenshot());
  await expectEditingColor(app.getByRole("textbox", { name: "備考", exact: true }));
  await expect(name).not.toHaveCSS("outline-color", blue);
  await expect(app.getByRole("combobox", { name: "業種名", exact: true })).toBeDisabled();
  await selectClassification(app.getByRole("combobox", { name: "部署名", exact: true }), "部署A");
  for (const label of ["展開名", "部署名", "期間名", "業種名"]) {
    const select = app.getByRole("combobox", { name: label, exact: true });
    await select.focus();
    await expect(select).toHaveCSS("outline-color", blue);
    await expect(select).toHaveCSS("color", ink);
  }
  const account = app.getByRole("combobox", { name: "1行目の勘定科目", exact: true });
  await account.focus();
  await selectAccount(account, { label: "売上高" });
  await account.focus();
  await expect(account).toHaveCSS("outline-color", blue);
  const amount = app.locator(".initiative-amount-table input[data-row]").first();
  await expectEditingColor(amount, true);
  await expect(app.locator('.kind-tabs [aria-selected="true"]')).toHaveCSS("border-bottom-color", blue);
  await expect(app.locator('.kind-tabs [aria-selected="true"]')).toHaveCSS("background-color", soft);
  await expect(app.getByRole("button", { name: "登録", exact: true })).toHaveCSS("background-color", ink);
  await app.getByRole("heading", { name: "施策入力", exact: true }).click();
  await expect(amount).not.toHaveCSS("outline-color", blue);
  await expect(app.locator(".classification-field select").first()).not.toHaveCSS("outline-color", blue);
});

test("種別と比較対象は選択中の文字だけ青く、切り替えとホバーでも配色を保つ", async ({ app }) => {
  await navigate(app, "施策入力");
  const tabs = app.locator(".kind-tabs");
  for (const label of ["確定予算", "一次予算"]) {
    const target = tabs.getByRole("tab", { name: label, exact: true });
    await target.click();
    await expect(target).toHaveCSS("color", blue);
    await expect(target).toHaveCSS("border-bottom-color", blue);
    await expect(target).toHaveCSS("background-color", soft);
    await expect(tabs.locator('[aria-selected="false"]')).not.toHaveCSS("color", blue);
  }
  for (const route of ["施策一覧", "総原価表", "展開表"]) {
    await navigate(app, route);
    for (const slot of await app.locator(".gliding-kind-slot").all()) {
      for (const label of ["確定予算", "一次予算"]) {
        const target = slot.getByRole("button", { name: label, exact: true });
        if (!await target.count()) continue;
        await target.click();
        await target.hover();
        await expect(target).toHaveAttribute("aria-pressed", "true");
        await expect(target).toHaveCSS("color", blue);
        for (const other of await slot.locator('[aria-pressed="false"]').all()) {
          await expect(other).not.toHaveCSS("color", blue);
        }
        await expect(slot.locator(".gliding-kind-indicator")).toHaveCSS("background-color", soft);
      }
      await slot.focus();
      await slot.press("Home");
      await expect(slot.locator('[aria-pressed="true"]')).toHaveCSS("color", blue);
    }
  }
});

test("前年金額は編集位置だけ青く、範囲選択の背景と罫線はグレーを保つ", async ({ page, app }) => {
  await navigate(app, "前年入力");
  const department = app.getByRole("combobox", { name: "部署名", exact: true });
  await selectClassification(department, "部署A");
  const industry = app.getByRole("combobox", { name: "業種名", exact: true });
  await industry.focus();
  await expect(industry).toBeFocused();
  await selectClassification(industry, "直営自動車");
  await page.mouse.move(page.viewportSize()!.width - 10, 200);
  await settleMotion(app.locator("body"));
  const april = app.getByRole("textbox", { name: "売上高 4月の前年金額", exact: true });
  await expectEditingColor(april, true);
  await april.press("Escape");
  await expect(april).toHaveClass("grid-amount-idle");
  await expect(april).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
  await april.press("Shift+ArrowRight");
  const may = app.getByRole("textbox", { name: "売上高 5月の前年金額", exact: true });
  await expect(may).toBeFocused();
  await expect(may).toHaveCSS("outline-color", blue);
  await expect(april).not.toHaveCSS("outline-color", blue);
  await expect(app.locator(".previous-cell-selected")).toHaveCount(2);
  for (const selected of await app.locator(".previous-cell-selected").all()) {
    await expect(selected).toHaveCSS("background-color", "rgb(244, 240, 230)");
    await expect(selected).toHaveCSS("box-shadow", "rgb(140, 135, 124) 0px 0px 0px 1px inset");
  }
});

test("全マスタの登録・編集欄と集計編集にも青を適用する", async ({ app }) => {
  for (const master of ["勘定科目マスタ", "展開マスタ", "業種マスタ", "部署マスタ", "期間マスタ"]) {
    await navigate(app, "マスタ");
    await app.locator(".master-menu").getByRole("button", { name: new RegExp(`^${master}`) }).click();
    await expect(app.getByRole("heading", { name: master, exact: true })).toBeVisible();
    for (const input of await app.locator(".account-master-form input:not([type=checkbox])").all()) await expectEditingColor(input);
    await app.locator(".account-master-list").getByRole("button", { name: /を編集$/ }).first().click();
    for (const input of await app.locator(".account-master-table input:not([type=checkbox])").all()) await expectEditingColor(input);
  }
  await navigate(app, "マスタ");
  await app.locator(".master-menu").getByRole("button", { name: /^集計マスタ/ }).click();
  await expect(app.getByRole("heading", { name: "集計マスタ", exact: true })).toBeVisible();
  await app.getByRole("button", { name: "営業利益を移動", exact: true }).press("F2");
  await expect(app.getByRole("textbox", { name: "営業利益の集計名", exact: true })).toBeDisabled();
  const target = app.getByRole("textbox", { name: "営業利益の表示名", exact: true });
  await expectEditingColor(target);
  await expect(target).toHaveCSS("border-color", blue);
  const theme = app.getByRole("switch", { name: "ダークテーマ" });
  await theme.click();
  await expect(target).not.toHaveCSS("outline-color", blue);
  await target.focus();
  for (const property of ["outline-color", "border-color", "caret-color"]) {
    await expect(target).toHaveCSS(property, "rgb(214, 184, 108)");
  }
  await theme.click();
  await expect(target).not.toHaveCSS("outline-color", blue);
  await expect(app.locator('.sidebar-item[aria-current="page"] svg')).toHaveCSS("color", blue);
  await navigate(app, "マスタ");
  await app.locator(".master-menu").getByRole("button", { name: /^種別マスタ/ }).click();
  await expect(app.getByRole("heading", { name: "種別マスタ", exact: true })).toBeVisible();
  await expect(app.locator("main input")).toHaveCount(0);
});

test("入口の年度以外のボタンと確認ダイアログのフォーカスはモノクロ", async ({ page, app }) => {
  const close = app.locator(".sidebar-footer").getByRole("button", { name: "閉じる", exact: true });
  await page.keyboard.press("Tab");
  await close.focus();
  await expect(close).toHaveCSS("outline-color", ink);
  await close.click();
  const cancel = app.getByRole("button", { name: "キャンセル", exact: true });
  await page.keyboard.press("Tab");
  await cancel.focus();
  await expect(cancel).toHaveCSS("outline-color", ink);
  await cancel.click();
  await close.click();
  await app.getByRole("alertdialog", { name: "閉じる", exact: true }).getByRole("button", { name: "閉じる", exact: true }).click();
  const year = app.getByRole("spinbutton", { name: "年度", exact: true });
  await page.keyboard.press("Tab");
  await year.focus();
  await expect(year).toHaveCSS("outline-color", blue);
  const create = app.getByRole("button", { name: "新規作成", exact: true });
  await create.focus();
  await expect(create).toHaveCSS("outline-color", ink);
  await expect(year).not.toHaveCSS("outline-color", blue);
});

test("配布用ビルドでも選択アイコンと編集枠が同じ青になる", async ({ page, context }) => {
  const bytes = await page.evaluate(async path => (await import(path)).fixtureBytes as number[], "/tests/ui/preview.ts");
  const production = await context.newPage();
  const errors: string[] = [];
  production.on("pageerror", error => errors.push(error.message));
  try {
    await production.goto("/Triadichrome-extension/index.html");
    await production.evaluate(installCloneableFiles, { bytes, name: "画面テスト.triadic" });
    await production.getByRole("button", { name: "ファイルを開く", exact: true }).click();
    await openInitiativeEntry(production);
    await expectEditingColor(production.getByRole("textbox", { name: "施策名", exact: true }));
    await expect(production.locator('.sidebar-item[aria-current="page"] svg')).toHaveCSS("color", blue);
    await expect(production.locator('.sidebar-item[aria-current="page"] span')).toHaveCSS("color", ink);
    expect(errors).toEqual([]);
  } finally { await production.close(); }
});


test("入口のファイルドロップ先だけ背景と破線を青で示し、文字はモノクロに保つ", async ({ page, app }) => {
  await page.getByRole("button", { name: "入口に戻す", exact: true }).click();
  const entry = app.locator(".entry-page");
  await expect(entry).toBeVisible();
  await entry.evaluate(node => {
    const data = new DataTransfer();
    data.items.add(new File([""], "確認.triadic"));
    node.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: data }));
  });
  await expect(entry).toHaveClass(/is-drag-active/);
  await expect(app.getByRole("heading", { name: "ここにドロップして開く", exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
  const section = app.locator(".entry-open-section");
  await expect(section).toHaveCSS("background-color", "rgb(238, 242, 255)");
  await expect(section).toHaveCSS("color", ink);
  await expect(app.locator(".entry-drop-description")).toHaveCSS("color", "rgb(104, 102, 95)");
  expect(await section.evaluate(node => getComputedStyle(node, "::after").borderColor)).toBe(blue);
  await entry.dispatchEvent("dragleave", { relatedTarget: null });
  await expect(entry).not.toHaveClass(/is-drag-active/);
  await expect(app.getByRole("heading", { name: "ファイルを開く", exact: true })).toBeVisible();
  await settleMotion(app.locator("body"));
  await expect(section).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("履歴選択と入出力のファイルドロップ案内はモノクロ", async ({ app }) => {
  await navigate(app, "履歴");
  for (const checkbox of await app.locator('.data-history-list input[type="checkbox"]').all()) {
    await expect(checkbox).toHaveCSS("accent-color", ink);
  }
  await navigate(app, "入出力");
  for (const checkbox of await app.locator('.io-check input').all()) {
    await expect(checkbox).toHaveCSS("accent-color", ink);
  }
  const panel = app.locator(".io-previous-panel");
  await panel.evaluate(node => {
    const data = new DataTransfer();
    data.items.add(new File([""], "前年.xlsx"));
    node.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: data }));
  });
  await expect(panel).toHaveClass(/is-drag-active/);
  await expect(panel).toHaveCSS("outline-color", ink);
  await expect(panel).toHaveCSS("background-color", soft);
  await panel.dispatchEvent("dragleave", { relatedTarget: null });
  await expect(panel).not.toHaveClass(/is-drag-active/);
});
