import { test, expect, openInitiativeEntry, selectClassification } from "./fixtures";
import type { Locator, FrameLocator } from "@playwright/test";

const jump = (app: FrameLocator) => app.getByRole("button", {name:"入力エラーの場所へ移動",exact:true}).first();
async function badNumber(input: Locator) {
  await input.click(); await input.press("ControlOrMeta+A"); await input.pressSequentially("1e");
  await expect(input).toHaveAttribute("aria-invalid","true");
}
async function bytes(app: FrameLocator) {
  return app.locator("body").evaluate(() => (window as Window & { readInputErrorBytes?: () => Promise<number[]> }).readInputErrorBytes!());
}
test.beforeEach(async ({page,app}) => {
  await page.goto("/tests/ui/preview.html?data=defaults");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.locator("body").evaluate(() => {
    const target=window as Window & {showOpenFilePicker?:()=>Promise<FileSystemFileHandle[]>};
    const original=target.showOpenFilePicker!;
    target.showOpenFilePicker=async()=>{
      const handles=await original(),handle=handles[0]!;
      Object.defineProperty(target,"readInputErrorBytes",{configurable:true,value:async()=>Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()))});
      return handles;
    };
  });
  await app.getByRole("button",{name:"ファイルを開く",exact:true}).click();
});
async function start(app: FrameLocator, name: string) {
  await openInitiativeEntry(app);
  await app.getByRole("textbox",{name:"施策名",exact:true}).fill(name);
  for(const [label,value] of [["展開名","コスト"],["部署名","部署A"],["業種名","直営自動車"]] as const) await selectClassification(app.getByRole("combobox",{name:label,exact:true}),value);
  const account=app.getByRole("combobox",{name:"1行目の勘定科目",exact:true});
  await account.focus();await account.selectOption("1");
}

test("自動保存エラーから別種別の3月へ移動し、保存内容と手修正0を保持する",async({app,page},info)=>{
  await start(app,"エラー移動確認");
  await app.getByRole("spinbutton",{name:"売上高 3月の金額",exact:true}).fill("10");
  await app.getByRole("button",{name:"登録",exact:true}).click();
  await app.getByRole("button",{name:"エラー移動確認",exact:true}).click();
  const march=app.getByRole("spinbutton",{name:"売上高 3月の金額",exact:true});
  await app.getByRole("tab",{name:"確定予算",exact:true}).click();
  await app.getByRole("spinbutton",{name:"売上高 4月の金額",exact:true}).fill("0");
  await expect(app.getByRole("button",{name:"← 施策一覧へ戻る",exact:true})).toBeEnabled();
  const before=await bytes(app);
  await app.getByRole("tab",{name:"一次予算",exact:true}).click();
  await badNumber(march);
  await expect(jump(app)).toBeVisible();
  await app.getByRole("tab",{name:"確定予算",exact:true}).click();
  await jump(app).click();
  await expect(app.getByRole("tab",{name:"一次予算",exact:true})).toHaveAttribute("aria-selected","true");
  await expect(march).toBeFocused();
  await expect(app.locator(".initiative-cell-selected")).toHaveCount(1);
  await expect(march).toHaveAttribute("aria-invalid","true");
  await expect.poll(() => march.evaluate(node => {
    const box=node.getBoundingClientRect(), panel=node.closest("#kind-amount-panel")!.getBoundingClientRect();
    return box.left >= panel.left && box.right <= panel.right && box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
  expect(await bytes(app)).toEqual(before);
  await page.screenshot({path:info.outputPath("input-error-location.png")});
  await march.press("Escape");
  await expect(march).toHaveValue("10");
  await expect(jump(app)).toHaveCount(0);
  await app.getByRole("tab",{name:"確定予算",exact:true}).click();
  await expect(march).not.toBeFocused();
  await expect(app.getByRole("spinbutton",{name:"売上高 4月の金額",exact:true})).toHaveValue("0");
});

test("新規登録の通知から確定予算のエラーへ移動できる",async({app})=>{
  await start(app,"新規エラー移動");
  const march=app.getByRole("spinbutton",{name:"売上高 3月の金額",exact:true});
  await app.getByRole("tab",{name:"確定予算",exact:true}).click();
  await badNumber(march);
  await app.getByRole("tab",{name:"一次予算",exact:true}).click();
  const before=await bytes(app);
  await app.getByRole("button",{name:"登録",exact:true}).click();
  await jump(app).click();
  await expect(app.getByRole("tab",{name:"確定予算",exact:true})).toHaveAttribute("aria-selected","true");
  await expect(march).toBeFocused();
  expect(await bytes(app)).toEqual(before);
  await march.press("Escape");
  await expect(jump(app)).toHaveCount(0);
});

test("前年入力の画面外のセルへ移動し、訂正後は次のエラーへ移る",async({app})=>{
  await app.getByRole("navigation",{name:"メインナビゲーション"}).getByRole("button",{name:"前年入力",exact:true}).click();
  await selectClassification(app.getByRole("combobox",{name:"部署名",exact:true}),"部署A");
  await selectClassification(app.getByRole("combobox",{name:"業種名",exact:true}),"直営自動車");
  const first=app.locator('input[data-row="0"][data-column="11"]');
  const second=app.locator('input[data-column="11"]').last();
  const before=await bytes(app);
  await first.fill("-"); await second.fill("1.0001");
  await app.locator(".previous-grid-container").evaluate(node=>{node.scrollLeft=0;node.scrollTop=0;});
  await jump(app).click();
  await expect(first).toBeFocused(); await expect(first).toHaveValue("-");
  expect(await bytes(app)).toEqual(before);
  await first.fill("0.001");
  await expect(second).toHaveAttribute("aria-invalid","true");
  await jump(app).click();
  await expect(second).toBeFocused();
  await expect.poll(() => second.evaluate(node => {
    const box=node.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && document.elementFromPoint(box.left + 5, box.top + 5) === node;
  })).toBe(true);
  await second.fill("0.002");
  await expect(jump(app)).toHaveCount(0);
});
