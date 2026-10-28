import ExcelJS from 'exceljs';
import type { Locator } from '@playwright/test';
import { markupCells, workbookCells, reportContractCells } from '../report-parity.mjs';
import { evaluator } from '../report-workbook.mjs';
import { test, expect } from './fixtures';

test('三表のExcel固有の列・前年行と、対応する画面の金額・行順・結合を照合する', async ({ page, app }) => {
  test.setTimeout(90_000);
  await page.goto('/tests/ui/preview.html');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate(() => {
    // Exercise the actual export/worker/blob boundary without writing an OS file.
    const exports: Promise<number[]>[] = []; Reflect.set(window, 'reportExports', exports);
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) { click.call(this); return; }
      exports.push(fetch(this.href).then(response => response.arrayBuffer()).then(bytes => [...new Uint8Array(bytes)]));
    };
  });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  const navigate = (name: string) => app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name, exact: true }).click();
  const select = async (group: Locator, kinds: number[]) => {
    for (const kind of kinds) {
      const box = group.getByRole('checkbox', { name: `前年見込を基準にした${kind === 1 ? '一次予算' : '確定予算'}`, exact: true });
      if (!await box.isChecked()) await box.click(); await expect(box).toBeChecked();
    }
    for (const kind of [1, 2].filter(kind => !kinds.includes(kind))) for (const prior of ['見込', '実績']) {
      const box = group.getByRole('checkbox', { name: `前年${prior}を基準にした${kind === 1 ? '一次予算' : '確定予算'}`, exact: true });
      if (await box.isChecked()) await box.click(); await expect(box).not.toBeChecked();
    }
  };
  for (const [index, selected] of [[1], [2], [1, 2]].entries()) {
    await navigate('入出力');
    const groups = app.getByRole('group', { name: '予算の比較条件', exact: true });
    await expect(groups).toHaveCount(2);
    for (let group = 0; group < 2; group++) await select(groups.nth(group), selected);
    await app.getByRole('button', { name: '選んだ表を出力', exact: true }).click();
    await expect(app.getByText('表を出力しました。', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => app.locator('body').evaluate(() => (Reflect.get(window, 'reportExports') as unknown[]).length)).toBe(index + 1);
    const bytes = await app.locator('body').evaluate(async (_, index) => await (Reflect.get(window, 'reportExports') as Promise<number[]>[])[index], index);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(bytes!) as unknown as ExcelJS.Buffer);
    const evaluate = evaluator(wb);
    for (const name of ['総原価表', '施策一覧', '展開表']) {
      await navigate(name);
      if (name !== '施策一覧') {
        await select(app.getByRole('group', { name: '予算の比較条件', exact: true }), selected);
        const previous = app.getByRole('checkbox', { name: '前年列に前年見込を表示', exact: true });
        if (!await previous.isChecked()) await previous.click(); await expect(previous).toBeChecked();
      }
      const table = app.getByRole('table', { name, exact: true }); await expect(table).toBeVisible();
      const expected = reportContractCells(markupCells(await table.evaluate(node => node.outerHTML)), name, selected, { 1: 1, 2: 1 });
      expect(workbookCells(wb.getWorksheet(name)!)).toEqual(expected);
      expect(workbookCells(wb.getWorksheet(name)!, evaluate)).toEqual(expected);
      if (name === '総原価表') {
        const actual = app.getByRole('checkbox', { name: '前年列に前年実績を表示', exact: true });
        await actual.click(); await expect(actual).toBeChecked();
        expect(wb.getWorksheet(name)!.getCell('B4').text).toContain(selected.length === 1 ? '前年見込' : '一次予算');
      }
    }
  }
});
