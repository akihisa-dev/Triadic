import { test, expect } from './fixtures';
test('費用だけが上限を超えても展開表の売上・利益と期間計を表示できる',async({page,app})=>{
  await page.goto('/tests/ui/preview.html?data=overflow-expense-only');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'展開表',exact:true}).click();
  await expect(app.getByRole('heading',{name:'展開表',exact:true})).toBeVisible();
  await expect(app.getByRole('button',{name:'費用だけ上限超過',exact:true})).toBeVisible();
  await expect(app.locator('.table-calculation-error')).toHaveCount(0);
  await expect(app.locator('.expansion-table')).not.toContainText('範囲を超え');
  await app.getByRole('spinbutton',{name:'比較対象1',exact:true}).getByRole('button',{name:'確定予算',exact:true}).click();
  await expect(app.getByRole('button',{name:'費用だけ上限超過',exact:true})).toBeVisible();
});
