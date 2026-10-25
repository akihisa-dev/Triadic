import {test,expect} from '@playwright/test';
test('数値条件は選択済みラジオだけをTab経路に含め、逆移動やEscで親内訳へ抜けない',async({page})=>{
  await page.goto('/tests/ui/breakdown-window.html');await page.getByRole('button',{name:'内訳を開く',exact:true}).click();
  const parent=page.locator('.cost-breakdown-dialog');const trigger=parent.getByRole('button',{name:/^反映額を絞り込む/});await trigger.click();
  const panel=page.locator('.table-filter-panel'),positive=panel.getByLabel('0より大きい',{exact:true}),apply=panel.getByRole('button',{name:'適用',exact:true});
  await positive.check();await positive.press('Shift+Tab');await expect(apply).toBeFocused();await page.keyboard.press('Tab');await expect(positive).toBeFocused();
  await positive.press('ArrowDown');await expect(panel.getByLabel('0',{exact:true})).toBeChecked();await page.keyboard.press('Shift+Tab');await expect(apply).toBeFocused();
  await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(parent).toBeVisible();await expect(trigger).toBeFocused();
  await trigger.click();await page.getByLabel('範囲を指定',{exact:true}).check();await panel.getByLabel('以上',{exact:true}).fill('0');
  for(const direction of ['Tab','Shift+Tab'])for(let i=0;i<10;i++){
    await page.keyboard.press(direction);expect(await panel.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  }
  await panel.getByRole('button',{name:'適用',exact:true}).click();await expect(parent).toBeVisible();
  await trigger.click();await panel.getByRole('button',{name:'解除',exact:true}).click();await expect(parent).toBeVisible();
});
