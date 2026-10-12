import { test, expect } from "./fixtures";

test("4固定列の昇降順を切り替え、画面を離れると登録順へ戻る", async ({ app, page }) => {
  await page.goto("/tests/ui/preview.html");
  await expect(page.getByRole("status")).toHaveText("操作できます");
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const menu = app.getByRole("navigation", { name: "メインナビゲーション" });
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  const table = app.getByRole("table", { name: "施策一覧", exact: true });
  const names = () => table.locator("tbody .initiative-name-button").allTextContents();
  const registration = await names();
  for (const label of ["展開名", "期間名", "施策名", "開始年月"]) {
    const header = table.getByRole("columnheader", { name: label, exact: true });
    await header.getByRole("button", { name: label, exact: true }).click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(header).toHaveText(`${label}▲`);
    await expect(table.locator("thead [aria-sort]")).toHaveCount(1);
    const ascending = await names();
    await header.getByRole("button", { name: label, exact: true }).press("Enter");
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await expect(header).toHaveText(`${label}▼`);
    expect(await names()).not.toEqual(ascending);
  }
  await menu.getByRole("button", { name: "Home", exact: true }).click();
  await menu.getByRole("button", { name: "施策一覧", exact: true }).click();
  await expect(table.locator("thead [aria-sort]")).toHaveCount(0);
  expect(await names()).toEqual(registration);
});

for(const large of [false,true]) test(`期間ID -1・0・正数・未選択を表示し昇降順を保つ（${large?'仮想表示':'通常表示'}）`,async({page,app})=>{
 await page.goto(`/tests/ui/preview.html?data=signed-periods${large?'-large':''}`);
 await expect(page.getByRole('status')).toHaveText('操作できます');
 await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
 await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
 const table=app.getByRole('table',{name:'施策一覧',exact:true});
 for(const [name,period] of [['負ID確認','あ期間'],['ゼロID確認','か期間'],['正ID確認','さ期間'],['未選択確認','']] as const) {
  const row=table.getByRole('row').filter({has:app.getByRole('button',{name,exact:true})});
  await expect(row.locator('.initiative-list-period')).toHaveText(period);
 }
 const header=table.getByRole('columnheader',{name:'期間名',exact:true});
 await header.getByRole('button',{name:'期間名',exact:true}).click();
 await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect(table.locator('tbody .initiative-name-button').first()).toHaveText('負ID確認');
 await header.getByRole('button',{name:'期間名',exact:true}).click();
 await expect(header).toHaveAttribute('aria-sort','descending');
 await expect(table.locator('tbody .initiative-name-button').first()).toHaveText('正ID確認');
 if(!large) {
  const labels=await table.locator('tbody .initiative-name-button').allTextContents();
  expect(labels.slice(0,4)).toEqual(['正ID確認','ゼロID確認','負ID確認','未選択確認']);
 }
});
