import { test, expect } from './fixtures';

for (const master of ['勘定科目','集計'] as const) test(`${master}の矢印移動後も同じ行の操作にフォーカスを戻す`, async ({page,app}) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'マスタ',exact:true}).click();
  await app.getByRole('button',{name:master==='勘定科目'?/^勘定科目マスタ/:/^集計マスタ/}).click();
  const handle=app.getByRole('button',{name:master==='勘定科目'?'売上高を並べ替え':'会議費を移動',exact:true});
  await handle.focus();
  await handle.press('ArrowDown');
  await expect(handle).toBeEnabled();
  await expect(handle).toBeFocused();
  await handle.press('ArrowUp');
  await expect(handle).toBeEnabled();
  await expect(handle).toBeFocused();
});
