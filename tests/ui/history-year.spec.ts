import { test, expect } from "@playwright/test";
test('異年度の履歴比較を拒否し、再試行しても削除用選択と現在画面を保持する', async ({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/tests/ui/history-year.html');
  const checks=page.getByRole('checkbox',{name:/の履歴を選択$/});await checks.first().check();
  await page.getByRole('button',{name:/と現在の差分$/}).click();
  await expect(page.getByRole('alert')).toContainText('履歴の基準年度が一致しません。');
  await expect(checks.first()).toBeChecked();
  await page.getByRole('button',{name:'比較を再試行',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('履歴の基準年度が一致しません。');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(checks.first()).toBeChecked();
  await expect(page.getByRole('button',{name:'保存を再試行',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});
