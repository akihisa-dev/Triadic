import { test, expect } from './fixtures';

test('金額範囲は正負の上限と片側未指定を再表示・再適用しても1円精度を保つ', async ({page, app}) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', {name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation', {name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
  const trigger = app.getByRole('button',{name:/^4月 売上を絞り込む/});
  for (const [min,max] of [['9007199254740.991','9007199254740.991'],['-9007199254740.991',''],['','0.001']]) {
    await trigger.click(); await app.getByLabel('範囲を指定',{exact:true}).check();
    await app.getByLabel('以上',{exact:true}).fill(min!); await app.getByLabel('以下',{exact:true}).fill(max!);
    await app.getByRole('button',{name:'適用',exact:true}).click();
    for (let repeat=0;repeat<2;repeat++) {
      await trigger.click();
      await expect(app.getByLabel('以上',{exact:true})).toHaveValue(min!);
      await expect(app.getByLabel('以下',{exact:true})).toHaveValue(max!);
      await app.getByRole('button',{name:'適用',exact:true}).click();
    }
  }
});
